"""Trains PlateNet on context squares.  python train.py TRAIN.json OUT [--epochs 40] [--bs 48] [--val VAL.json]
TRAIN.json: [{"img": path to a 384 px context square, "p": [x, y, r] in context px or null, "clip": id}, ...]"""
import json, math, os, random, sys, time
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from platenet import IN, STRIDE, PlateNet, decode

cv2.setNumThreads(0)
HM = IN // STRIDE


def arg(name, default):
    return type(default)(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def motion_blur(img, rng):
    k = rng.choice([3, 5, 7, 9, 13, 17])
    ker = np.zeros((k, k), np.float32)
    ker[k // 2, :] = 1
    M = cv2.getRotationMatrix2D((k / 2 - 0.5, k / 2 - 0.5), rng.uniform(0, 180), 1)
    ker = cv2.warpAffine(ker, M, (k, k))
    return cv2.filter2D(img, -1, ker / max(ker.sum(), 1e-6))


def photometric(img, rng):
    if rng.random() < 0.8:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        if rng.random() < 0.5:
            hsv[..., 0] = (hsv[..., 0] + rng.uniform(0, 180)) % 180
        hsv[..., 1] = np.clip(hsv[..., 1] * rng.uniform(0.3, 1.6), 0, 255)
        img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    if rng.random() < 0.1:
        img = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    x = img.astype(np.float32) / 255
    x = np.clip((x - 0.5) * rng.uniform(0.6, 1.5) + 0.5 + rng.uniform(-0.2, 0.2), 0, 1) ** rng.uniform(0.6, 1.7)
    if rng.random() < 0.3:
        x = np.clip(x + rng.normal(0, rng.uniform(0.01, 0.04), x.shape), 0, 1)
    img = (x * 255).astype(np.uint8)
    if rng.random() < 0.4:
        img = motion_blur(img, rng)
    elif rng.random() < 0.2:
        img = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.5, 2))
    return img


def occlude(img, p, rng):
    """a limb-like bar or a block over part of the plate"""
    x, y, r = p
    for _ in range(rng.integers(1, 3)):
        col = tuple(int(v) for v in (rng.integers(0, 255, 3) if rng.random() < 0.5 else img[rng.integers(0, IN), rng.integers(0, IN)]))
        a = rng.uniform(0, math.pi)
        o = rng.uniform(0.3, 1.1) * r
        cx, cy = x + o * math.cos(a + math.pi / 2), y + o * math.sin(a + math.pi / 2)
        L = rng.uniform(1.5, 4) * r
        p1 = (int(cx - L * math.cos(a)), int(cy - L * math.sin(a))); p2 = (int(cx + L * math.cos(a)), int(cy + L * math.sin(a)))
        cv2.line(img, p1, p2, col, max(2, int(rng.uniform(0.15, 0.6) * r)), cv2.LINE_AA)
    return img


class Crops(Dataset):
    def __init__(self, rows, train=True, mult=1):
        self.rows, self.train, self.mult = rows, train, mult

    def __len__(self):
        return len(self.rows) * self.mult

    def __getitem__(self, i):
        row = self.rows[i % len(self.rows)]
        rng = np.random.default_rng() if self.train else np.random.default_rng(i)
        ctx = cv2.imread(row["img"])
        C = ctx.shape[0]
        p = row["p"]
        side, cx, cy, rot, flip = 256.0 * C / 384, C / 2, C / 2, 0.0, False
        if self.train:
            mode = rng.random()
            if p is not None and mode > 0.94:
                side = 256.0 * C / 384 * rng.uniform(0.6, 1.1)
                a = rng.uniform(0, 2 * math.pi)
                d = side * 0.72 + p[2] * 1.2
                cx, cy = p[0] + d * math.cos(a), p[1] + d * math.sin(a)
                p = None
            elif p is not None and mode < 0.35:
                frac = rng.uniform(0.1, 0.8)
                side = min(2 * p[2] / frac, C * 1.3)
                u, v = rng.uniform(0.03, 0.97, 2)
                cx, cy = p[0] + (0.5 - u) * side, p[1] + (0.5 - v) * side
            else:
                side = 256.0 * C / 384 * rng.uniform(0.75, 1.35)
                cx, cy = C / 2 + rng.uniform(-45, 45, 2) * C / 384
            rot, flip = rng.uniform(-12, 12), rng.random() < 0.5
        s = IN / side
        M = cv2.getRotationMatrix2D((cx, cy), rot, s)
        M[:, 2] += IN / 2 - np.array([cx, cy])
        img = cv2.warpAffine(ctx, M, (IN, IN), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        q = None
        if p is not None:
            x, y = M @ np.array([p[0], p[1], 1.0])
            q = [x, y, p[2] * s]
        if flip:
            img = img[:, ::-1].copy()
            if q: q[0] = IN - q[0]
        if self.train:
            img = photometric(img, rng)
            if q and rng.random() < 0.3:
                img = occlude(img, q, rng)
        heat = np.zeros((HM, HM), np.float32)
        reg = np.zeros(3, np.float32)
        cell = np.array([-1, -1])
        if q and 0 <= q[0] < IN and 0 <= q[1] < IN:
            gx, gy, gr = q[0] / STRIDE, q[1] / STRIDE, q[2] / STRIDE
            sig = max(1.0, gr / 3)
            yy, xx = np.mgrid[0:HM, 0:HM]
            heat = np.exp(-((xx + 0.5 - gx) ** 2 + (yy + 0.5 - gy) ** 2) / (2 * sig * sig)).astype(np.float32)
            ix, iy = int(gx), int(gy)
            heat[iy, ix] = 1
            cell = np.array([ix, iy])
            reg = np.array([gx - ix - 0.5, gy - iy - 0.5, math.log(max(q[2], 1) / IN)], np.float32)
        x = torch.from_numpy(img[:, :, ::-1].copy()).permute(2, 0, 1).float() / 255
        return x, torch.from_numpy(heat), torch.from_numpy(reg), torch.from_numpy(cell), torch.tensor(q if q else [-1.0, -1, -1], dtype=torch.float32)


class Stream(Crops):
    """an endless training stream: a clip by weight, then a frame of it; a share of plate-free frames"""

    def __init__(self, clips, neg, ids, wts, neg_share, n):
        super().__init__([None])
        self.clips, self.neg, self.ids, self.wts, self.neg_share, self.n = clips, neg, ids, wts, neg_share, n

    def __len__(self):
        return self.n

    def __getitem__(self, i):
        r = random.Random()
        self.rows = [r.choice(self.neg)] if self.neg and r.random() < self.neg_share else [r.choice(self.clips[r.choices(self.ids, self.wts)[0]])]
        return super().__getitem__(0)


def loss_fn(out, heat, reg, cell):
    pred = torch.sigmoid(out[:, 0]).clamp(1e-4, 1 - 1e-4)
    pos = heat.eq(1).float()
    l_pos = -(torch.log(pred) * (1 - pred) ** 2 * pos).sum()
    l_neg = -(torch.log(1 - pred) * pred ** 2 * (1 - heat) ** 4 * (1 - pos)).sum()
    B = out.shape[0]
    l_heat = (l_pos + l_neg) / max(1.0, pos.sum().item())
    has = cell[:, 0] >= 0
    if has.any():
        b = torch.arange(B, device=out.device)[has]
        got = out[b, 1:, cell[has, 1], cell[has, 0]]
        l_off = F.l1_loss(got[:, :2], reg[has, :2])
        l_size = F.l1_loss(got[:, 2], reg[has, 2])
    else:
        l_off = l_size = out.sum() * 0
    return l_heat + l_off + 2 * l_size, (l_heat.item(), float(l_off.detach()), float(l_size.detach()))


@torch.no_grad()
def evaluate(model, dl, dev):
    model.eval()
    e, miss, fp, npos, nneg = [], 0, 0, 0, 0
    for x, heat, reg, cell, q in dl:
        conf, px, py, pr = [v.cpu() for v in decode(model(x.to(dev)))]
        for i in range(len(x)):
            if cell[i, 0] >= 0:
                npos += 1
                if conf[i] < 0.3: miss += 1
                else: e.append(math.hypot(px[i] - q[i, 0], py[i] - q[i, 1]) / q[i, 2])
            else:
                nneg += 1
                fp += conf[i] >= 0.3
    e = np.array(e) if e else np.array([9.0])
    return dict(n=npos, w25=float((e <= 0.25).sum() / max(1, npos)), w50=float((e <= 0.5).sum() / max(1, npos)), miss=miss / max(1, npos), neg=nneg, fp=int(fp))


def main():
    rows = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    epochs, bs = arg("--epochs", 40), arg("--bs", 48)
    val = json.load(open(arg("--val", ""))) if "--val" in sys.argv else []
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    model = PlateNet().to(dev)
    print("params", sum(p.numel() for p in model.parameters()), "train", len(rows), "pos", sum(r["p"] is not None for r in rows), "val", len(val), flush=True)
    per_epoch = arg("--per-epoch", 6000)
    pos = [r for r in rows if r["p"] is not None]; neg = [r for r in rows if r["p"] is None]
    clips = {}
    for r in pos: clips.setdefault(r["clip"], []).append(r)
    dl_val = DataLoader(Crops(val, train=False), batch_size=64, num_workers=2) if val else None
    opt = torch.optim.AdamW(model.parameters(), lr=arg("--lr", 2e-3), weight_decay=1e-4)
    steps = epochs * (per_epoch // bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=arg("--lr", 2e-3), total_steps=steps, pct_start=0.08)
    neg_share = arg("--neg", 0.2)
    # clips are drawn by weight (phone clips 3x), not by frame count, so one long clip cannot dominate
    ids = list(clips)
    wts = [clips[c][0].get("w", 1) for c in ids]

    dl = DataLoader(Stream(clips, neg, ids, wts, neg_share, per_epoch), batch_size=bs, num_workers=5, drop_last=True, persistent_workers=True)
    for ep in range(epochs):
        model.train()
        t0, agg = time.time(), np.zeros(3)
        for i, (x, heat, reg, cell, _) in enumerate(dl):
            loss, parts = loss_fn(model(x.to(dev)), heat.to(dev), reg.to(dev), cell.to(dev))
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            agg += parts
        msg = f"ep {ep} loss heat {agg[0] / (i + 1):.3f} off {agg[1] / (i + 1):.3f} size {agg[2] / (i + 1):.3f} {time.time() - t0:.0f}s"
        if dl_val and (ep % 4 == 3 or ep == epochs - 1):
            msg += " val " + json.dumps(evaluate(model, dl_val, dev))
        print(msg, flush=True)
        torch.save(model.state_dict(), f"{out}/last.pt")


if __name__ == "__main__":
    main()
