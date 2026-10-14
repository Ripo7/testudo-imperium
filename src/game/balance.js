// Every number the balance of the game rests on, as plain data. The game reads its live values from here (data.js
// builds the named units, perks and buildings on top of these objects), and the tuner (tools/tune.js) rewrites this file.
// What each number means, its bounds and its group: game/params.js. Keep this file pure data: no imports, no code.
export const BALANCE = {
  "units": {
    "spear": { "cost": { "gold": 40, "food": 75, "wood": 50, "stone": 0 }, "upk": 0.4, "hp": 1, "atk": 0.78, "time": 8 },
    "arch": { "cost": { "gold": 40, "food": 50, "wood": 85, "stone": 0 }, "upk": 0.35, "hp": 0.9, "atk": 0.6, "time": 9 },
    "cav": { "cost": { "gold": 130, "food": 120, "wood": 30, "stone": 0 }, "upk": 0.7, "hp": 1.6, "atk": 1.6, "time": 14 },
    "siege": { "cost": { "gold": 75, "food": 0, "wood": 175, "stone": 100 }, "upk": 0.15, "hp": 25, "atk": 0.5, "time": 16 }
  },
  "elite": {
    "leg": { "cost": { "gold": 115, "food": 105, "wood": 25, "stone": 45 }, "upk": 0.5, "hp": 1.6, "atk": 1.45, "time": 12, "vs": { "spear": 1.3, "arch": 1.2 }, "hurt": { "cav": 0.9 }, "shoot": 0, "charge": 1, "beatsBy": 1.35, "power": 2.2 },
    "ele": { "cost": { "gold": 150, "food": 130, "wood": 25, "stone": 0 }, "upk": 0.65, "hp": 2.3, "atk": 1.2, "time": 16, "vs": { "spear": 1.1, "cav": 1.6 }, "hurt": { "shot": 1.35, "spear": 1.1, "cav": 0.6 }, "shoot": 0, "charge": 2, "cavShy": 0.3, "slow": 0.85, "assault": 0.85, "beatsBy": 1.18, "power": 3 },
    "gae": { "cost": { "gold": 70, "food": 90, "wood": 45, "stone": 0 }, "upk": 0.4, "hp": 1.05, "atk": 1.3, "time": 7, "vs": { "spear": 1.2, "arch": 1.5 }, "hurt": { "shot": 1.2, "cav": 1.2 }, "shoot": 0, "charge": 1.8, "beatsBy": 1.4, "power": 1.7 },
    "char": { "cost": { "gold": 115, "food": 90, "wood": 50, "stone": 0 }, "upk": 0.5, "hp": 1.5, "atk": 1.3, "time": 13, "vs": { "arch": 1.6, "siege": 2 }, "hurt": { "spear": 2 }, "shoot": 0.75, "charge": 1.6, "rough": 0.6, "assault": 0.95, "beatsBy": 1.18, "power": 2.4 }
  },
  "combat": {
    "kDmg": 0.075,
    "roundT": 0.55,
    "vs": { "spear": { "cav": 1.9 }, "cav": { "arch": 2, "siege": 2, "spear": 0.6 } },
    "twDef": { "spear": 1.2, "leg": 1.2, "arch": 0.6, "cav": 0.9, "siege": 0.4 },
    "twCav": { "spear": 0.6, "leg": 0.8, "arch": 2.5, "cav": 1, "siege": 2.5 },
    "terrainDef": { "5": 1.2, "7": 1.25, "8": 1.5, "9": 1.5 },
    "archR": 1.15,
    "archM": 0.5,
    "rr": 3,
    "aggrAtk": 1.12,
    "aggrDef": 0.95,
    "defAtk": 0.92,
    "defDef": 1.22,
    "star": 0.07,
    "militiaAtk": 0.9,
    "home": 1.25,
    "river": 0.8,
    "flank": 1.25,
    "cavRough": 0.6,
    "cavCharge": 1.8,
    "cavLone": 1.25,
    "testudo": 0.45,
    "wallDef": 0.45,
    "wallArch": 0.3,
    "breakAt": 0.5,
    "breakStar": 0.06
  },
  "buildings": {
    "farm": { "cost": { "gold": 90, "food": 0, "wood": 60, "stone": 30 }, "time": 30, "food": 0.9 },
    "forum": { "cost": { "gold": 70, "food": 0, "wood": 50, "stone": 80 }, "time": 30, "gold": 0.8 },
    "barracks": { "cost": { "gold": 110, "food": 0, "wood": 70, "stone": 60 }, "time": 28, "speed": 0.7, "militia": 70 },
    "temple": { "cost": { "gold": 80, "food": 0, "wood": 30, "stone": 100 }, "time": 34, "loyalty": 3, "stretch": 0.5 },
    "walls": { "cost": [{ "gold": 30, "food": 0, "wood": 50, "stone": 150 }, { "gold": 60, "food": 0, "wood": 80, "stone": 320 }, { "gold": 120, "food": 0, "wood": 120, "stone": 550 }], "time": [10, 15, 20] },
    "fort": { "cost": { "gold": 80, "food": 0, "wood": 120, "stone": 200 }, "time": 15, "max": 220, "walls": 2, "guard": 6 }
  },
  "perks": {
    "rome": { "build": 0.67, "buildTime": 0.6 },
    "carthage": { "costMul": { "food": 0.65 }, "feed": 0.65, "market": { "buy": 110, "sell": 95 }, "port": 0.6 },
    "gaul": { "recruitTime": 0.6, "unitCost": 0.8 },
    "egypt": { "nile": 1.3 }
  },
  "economy": {
    "pay": 0.4,
    "market": { "lot": 100, "buy": 130, "sell": 70 },
    "plunder": 0.4,
    "abroad": 1.35,
    "secure": 1.12,
    "overRate": 0.8,
    "overFloor": 0.6,
    "overSlow": 3,
    "fairExtra": 0.05,
    "revolt": 0.012,
    "loyalTime": 150
  },
  "ai": {
    "mix": [{ "spear": 0.25, "leg": 0.45, "arch": 0.15, "cav": 0.15 }, { "spear": 0.35, "leg": 0.3, "arch": 0.15, "cav": 0.2 }, { "spear": 0.25, "leg": 0.4, "arch": 0.1, "cav": 0.25 }, { "spear": 0.3, "leg": 0.35, "arch": 0.2, "cav": 0.15 }],
    "aggr": [0.6, 0.6, 0.85, 0.6],
    "prov": { "complete": 3, "nearly": 1.7, "breaks": 1.15, "breakLeader": 1.5, "fort": 1.7, "need": 0.68 }
  },
  "diplomacy": {
    "endgame": { "pressOn": 0.5, "warRatio": 0.75, "warChance": 3, "dispute": 3, "nearWin": 3, "claim": 0.15, "claimWar": 1 },
    "rivalry": { "gangAt": 0.5, "gangMax": 1, "gangK": 6 },
    "peaceWill": 0.3,
    "tributeFloor": -0.1
  }
};
