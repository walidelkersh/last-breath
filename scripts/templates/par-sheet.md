# PAR sheet

This sheet lists the exact figures of the three dives I have built. The script `scripts/generate_docs.py` reads every figure from `config/dives.json` and from the reports in `reports/`, so a figure here is the one the solver wrote. The config is version {{version}}, with hash `{{hash}}`. Money is in bets, and one unit is a thousandth of a bet. The solver works in double precision, and I round the figures for printing only.

The RTP is the expected award of one round as a share of the bet, and the standard deviation is that of the award of one round, in bets. The hit frequency is the share of rounds that pay anything. Mean spins counts the spins in a round, and mean crates counts the crates on the final board. The Grand figure is one over the chance that the board fills, and the reachable maximum is the largest award that can happen, which is a full board of the biggest coin plus the Grand. The rules are in [game-design.md](game-design.md), and the maths behind the figures is in [math.md](math.md).

## Summary

{{summary}}

The simulated row is one run per dive with seed {{seed}}. It checks the engine against the exact rows, and it is not a figure of the game.

## Classic Dive

The clock starts at {{classic.clock}} breaths and goes back to {{classic.refill}} whenever a crate lands, and the coins come from the mixed table.

{{figures.classic}}

A round pays nothing in {{classic.nothing}} of cases, which is the first entry of the crate table at the end of this section, and the Grand is {{classic.grand_share_rtp}} of the RTP. On every spin each empty cell draws one of the outcomes below, and a crate takes its value from the weights in the second table.

{{landing.classic}}

{{weights.classic}}

The last table gives the chance that the final board holds a given number of crates. A board of {{cells}} crates is a full board, and it pays the Grand.

{{distribution.classic}}

## Drift Dive

The round is exactly {{drift.clock}} spins, whatever lands, unless the board fills first. The config calls this dive `Static`, and its reports are named `static`. The coins come from the shallow table, which has no Major.

{{figures.drift}}

The mean number of spins prints as {{drift.spins}} because only a full board stops a round early, and the Grand is {{drift.grand_share_rtp}} of the RTP. The outcomes of an empty cell and the weights of a crate are below, followed by the crate distribution.

{{landing.drift}}

{{weights.drift}}

{{distribution.drift}}

## Tank Dive

The clock starts at {{tank.clock}} breaths and nothing refills it. An air tank adds breaths and then clears, and a round takes at most {{tank.tank_limit}} tanks. The coins come from the light table.

{{figures.tank}}

The mean number of spins is above the {{tank.clock}} breaths the round starts with because the tanks add breaths, and the Grand is {{tank.grand_share_rtp}} of the RTP. The outcome table below is the draw for a single empty cell, and a tank drawn after the limit counts as nothing.

{{landing.tank}}

{{weights.tank}}

{{distribution.tank}}
