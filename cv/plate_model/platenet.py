"""PlateNet: MobileNetV3-small (torchvision, BSD) + a light top-down neck, CenterNet-style head at stride 4.
Input 256x256 RGB crop centred between the wrists. Output 4 maps at 64x64: centre heat (logit), dx, dy (cells),
log(radius / 256). Confidence that a plate is visible = the peak of sigmoid(heat)."""
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision

IN, STRIDE = 256, 4
MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)


def sep(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cin, 3, padding=1, groups=cin, bias=False), nn.Conv2d(cin, cout, 1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class PlateNet(nn.Module):
    def __init__(self, pretrained=True, width=64):
        super().__init__()
        f = torchvision.models.mobilenet_v3_small(weights="IMAGENET1K_V1" if pretrained else None).features
        self.s4, self.s8, self.s16, self.s32 = f[:2], f[2:4], f[4:9], f[9:12]
        self.lat = nn.ModuleList([nn.Conv2d(c, width, 1) for c in (16, 24, 48, 96)])
        self.smooth = nn.ModuleList([sep(width, width) for _ in range(3)])
        self.head = nn.Sequential(sep(width, width), nn.Conv2d(width, 4, 1))
        self.head[-1].bias.data[0] = -2.19
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, x):
        """x: RGB 0..1, (B, 3, 256, 256)"""
        x = (x - self.mean) / self.std
        c2 = self.s4(x); c3 = self.s8(c2); c4 = self.s16(c3); c5 = self.s32(c4)
        p = self.lat[3](c5)
        for lat, sm, c in ((self.lat[2], self.smooth[2], c4), (self.lat[1], self.smooth[1], c3), (self.lat[0], self.smooth[0], c2)):
            p = sm(lat(c) + F.interpolate(p, scale_factor=2.0, mode="nearest"))
        return self.head(p)


def decode(out):
    """(B, 4, 64, 64) -> conf, x, y, r in crop px"""
    heat = torch.sigmoid(out[:, 0])
    B, Hh, Ww = heat.shape
    conf, idx = heat.view(B, -1).max(1)
    iy, ix = idx // Ww, idx % Ww
    b = torch.arange(B, device=out.device)
    x = (ix + 0.5 + out[b, 1, iy, ix]) * STRIDE
    y = (iy + 0.5 + out[b, 2, iy, ix]) * STRIDE
    r = torch.exp(out[b, 3, iy, ix]) * IN
    return conf, x, y, r
