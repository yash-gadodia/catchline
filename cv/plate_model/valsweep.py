"""Picks the confidence threshold on the validation clips (pseudo-labelled, never the test set).  python valsweep.py VAL.json WEIGHTS"""
import json, sys
import numpy as np
import torch
from torch.utils.data import DataLoader
from platenet import PlateNet, decode
from train import Crops

if __name__ == "__main__":
    rows = json.load(open(sys.argv[1]))
    dev = "mps"
    model = PlateNet(pretrained=False).to(dev).eval()
    model.load_state_dict(torch.load(sys.argv[2], map_location=dev))
    pc, nc = [], []
    with torch.no_grad():
        for x, heat, reg, cell, q in DataLoader(Crops(rows, train=False), batch_size=64):
            conf = decode(model(x.to(dev)))[0].cpu().numpy()
            for i in range(len(x)):
                (pc if cell[i, 0] >= 0 else nc).append(conf[i])
    pc, nc = np.array(pc), np.array(nc)
    for t in (0.2, 0.3, 0.4, 0.5, 0.6):
        print(f"thr {t}: val plate frames missed {100 * (pc < t).mean():.1f}% of {len(pc)}, no-barbell frames fired {100 * (nc >= t).mean():.1f}% of {len(nc)}")
