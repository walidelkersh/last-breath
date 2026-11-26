# PAR sheet

This sheet lists the exact figures of the three dives I have built. The script `scripts/generate_docs.py` reads every figure from `config/dives.json` and from the reports in `reports/`, so a figure here is the one the solver wrote. The config is version {{version}}, with hash `{{hash}}`. Money is in bets. One unit is a thousandth of a bet. The solver works in double precision, and I round the figures for printing only.

The RTP is the expected award of one round as a share of the bet. The standard deviation is that of the award of one round, in bets. The hit frequency is the share of rounds that pay anything. Mean spins counts the spins in a round, and mean crates counts the crates on the final board. The Grand figure is one over the chance that the board fills. The reachable maximum is the largest award that can happen, which is a full board of the biggest coin plus the Grand. The rules are in [game-design.md](game-design.md), and the maths behind the figures is in [math.md](math.md).

## Summary

{{summary}}

The simulated row is one run per dive with seed {{seed}}. It checks the engine against the exact rows, and it is not a figure of the game.

## Classic Dive

The clock starts at {{classic.clock}} breaths and goes back to {{classic.refill}} whenever a crate lands. Coins come from the mixed table.

{{figures.classic}}

On every spin each empty cell draws one of these outcomes.

{{landing.classic}}

The mixed table decides the value of a crate.

{{weights.classic}}

The last table gives the chance that the final board holds a given number of crates. A board of {{cells}} crates is a full board, and it pays the Grand.

{{distribution.classic}}

## Drift Dive

The round is exactly {{drift.clock}} spins, whatever lands, unless the board fills first. The config calls this dive `Static`, and its reports are named `static`. Coins come from the shallow table, which has no Major.

{{figures.drift}}

On every spin each empty cell draws one of these outcomes.

{{landing.drift}}

The shallow table decides the value of a crate.

{{weights.drift}}

The final board holds this many crates with these probabilities.

{{distribution.drift}}

## Tank Dive

The clock starts at {{tank.clock}} breaths and nothing refills it. An air tank adds breaths and then clears, and a round takes at most {{tank.tank_limit}} tanks. Coins come from the light table.

{{figures.tank}}

Every empty cell draws one of these outcomes on every spin. A tank drawn after the limit counts as nothing.

{{landing.tank}}

The light table decides the value of a crate.

{{weights.tank}}

The final board holds this many crates with these probabilities.

{{distribution.tank}}
