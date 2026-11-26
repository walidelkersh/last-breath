[Play Last Breath in the browser](https://walidelkersh.github.io/last-breath/)

Last Breath is a hold-and-spin game with no base game. Each bet buys one dive, which is a full round on an empty 5x3 board, and the coins that land stay in their cell while a clock of breaths decides when the round ends. I have built three dives, Classic, Drift and Tank, with the engines, an exact solver and a simulator written in C#. The client is a Blazor WebAssembly app that runs the same engine in the browser, and it is a demo with play money.

Every dive returns about 96% of the bet. The exact figures come from the solver, and a Python script recomputes them in fractions and agrees to 1e-12. Classic returns {{classic.rtp}} with a standard deviation of {{classic.sd}} bets per round, a hit frequency of {{classic.hit}} and {{classic.spins}} spins on average, and its Grand lands about once in {{classic.grand_odds}} rounds. Drift returns {{drift.rtp}} with a standard deviation of {{drift.sd}}, a hit frequency of {{drift.hit}}, {{drift.spins}} spins and a Grand once in {{drift.grand_odds}} rounds. Tank returns {{tank.rtp}} with a standard deviation of {{tank.sd}}, a hit frequency of {{tank.hit}}, {{tank.spins}} spins and a Grand once in {{tank.grand_odds}} rounds.

I also played {{rounds}} rounds of each dive with seed {{seed}} through the real engines, and the simulated returns were {{classic.sim_rtp}}, {{drift.sim_rtp}} and {{tank.sim_rtp}}. That is one seed per dive, and the Grand carries most of the variance in Classic and Tank, so a single seed can land a standard error or so from the exact figure, as it did for those two. The engines, the solvers and the Python check all follow one reading of the rules, so none of them can show that I misread a rule. Free, Wreck and Crew are not built, and I tested the client in Chromium only.

## Build, test and run

The build needs the .NET 8 SDK or newer. The browser tests need Node 18 or newer, and they publish the client, serve it and drive Chromium.

```
dotnet build LastBreath.sln -c Release
dotnet test LastBreath.sln -c Release
dotnet run --project src/LastBreath.Web
cd tests/e2e && npm install && npx playwright install chromium && npx playwright test
```

The lab is the console project. Its `play` command plays one round from a seed, `solve` solves each dive exactly, `simulate` plays rounds through the real engines, and `export-pool` and `tune` write a ticket pool and search for the crate numerator. The Python check is a separate script, run as `python -I scripts/independent_check.py`, that reads the same config.

```
dotnet run --project src/LastBreath.Lab -c Release -- play --dive tank --seed 54
dotnet run --project src/LastBreath.Lab -c Release -- simulate --dive classic,static,tank --rounds 10000000 --seed 1
```

Running `bash scripts/reproduce.sh` repeats the solve, the Python check and the simulation, and then rewrites the documents from the reports.

## Documents

The [game design](docs/game-design.md) describes the game and the three dives. The [math](docs/math.md) gives the formulas, the exact figures and how I checked them, and the [PAR sheet](docs/par-sheet.md) has the tables for each dive. A script writes all three from the reports, so edit the templates in `scripts/templates` and not the documents.

## License

MIT, see `LICENSE`.
