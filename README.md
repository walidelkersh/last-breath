# Last Breath

Last Breath is a hold-and-spin game. Each bet buys one dive, which is a full round on an empty 5x3 board, so there is no base game to play first. Coins that land stay in their cell, and a clock of breaths decides when the round ends. I am writing it in C#, and I want the exact math to be the source of truth, with simulation used only to check the engine.

## Status

The engines for the first three dives exist and can be played from the command line. So far there is:

- a solution with a core library, a console project called the lab, a Blazor WebAssembly client and an xUnit test project
- the PCG32 random source, with tests against its reference output
- `config/dives.json`, which holds the cash ladder, the jackpots, the bets, three weight tables, and the landing and clock parameters for the first three dives (Classic, Drift and Tank)
- the config loader, which refuses a file unless each weight table sums to 100,000, each dive's landing numerators sum to at most 1,000,000, money values are multiples of 50 units and bets are multiples of 0.20
- the board, the landing draw with its fixed order of random numbers, settlement, and the round and turn model
- one engine class per dive in `src/LastBreath.Core/Dives`, each playing a full round from an empty board: Classic has 3 breaths and refills them to 3 whenever anything lands, Drift plays exactly 6 spins with no refill (the config calls it `Static`), and Tank has 4 breaths with no refill, where an air tank adds 1, 2 or 3 breaths and then clears, at most 3 tanks per round
- a ticket model that turns a finished round into JSON, and a validator for Classic, Drift and Tank tickets that checks every turn, replays the clock and refuses a pool with a repeated ticket id
- an exact solver per dive in `src/LastBreath.Core/Analysis`, by backward induction over (crates, breaths) for Classic, (crates, breaths, tanks used) for Tank, and a closed form for Drift that a second induction checks; `lab solve --dive classic,static,tank` (or `--all`) writes each result to `reports/solve-<dive>.json`
- `lab simulate`, which plays rounds with the real engines from one PCG32 stream and checks them against the exact solve: the mean award (from the textbook standard error and from 100 batch means), hit frequency and mean spins within 3 standard errors, and chi-squares of the final crate count and of 12 award buckets, with the bucket edges taken from the exact distribution. The first million rounds are also turned into tickets and validated. It writes `reports/simulate-<dive>.json` and exits 1 if a check fails
- `lab export-pool`, which plays rounds from one seed, turns each into a ticket, validates every ticket and refuses to write the pool unless all of them pass. `reports/pool/<dive>/TicketPool.json` is too large to track (about 200 MB for 100,000 Classic tickets), so it is ignored, while `PoolReport.txt` next to it is tracked: the ticket count, seed, config hash, mean win against the exact mean with a 99% interval, a chi-square of the final crate count, an award histogram and the average win on each turn
- `lab tune`, which searches the exact solver for the integer crate numerator that puts a dive closest to a 96% RTP and reports the old and new numerator. It only reports, and it never tunes by simulation
- a client page that shows the game name and nothing else
- `scripts/independent_check.py`, a Python check written from the rules alone that works out each dive's exact math in fractions and compares it with the solver reports once they exist: `python -I scripts/independent_check.py --dives classic,static,tank`, or `--self-test` for its hand-checked cases

All three engines end the round at once when the board is full, and a full board pays the Grand on top of the board total.

Money is held as whole units, where one unit is a thousandth of the bet, and it only becomes credits at settlement. No floating point touches a payout.

To watch one round, give the lab a dive and a seed. The dive is `classic`, `static` or `tank`, and the same seed always plays the same round. The lab prints each spin with the board after it, in units.

```
dotnet run --project src/LastBreath.Lab -c Release -- play --dive tank --seed 54
```

To check an engine against its exact solve, give the lab the dives, a number of rounds and a seed. Ten million rounds of one dive take about 20 seconds on my machine.

```
dotnet run --project src/LastBreath.Lab -c Release -- simulate --dive classic,static,tank --rounds 10000000 --seed 1
```

A pool of tickets comes from the same engines, and the seed defaults to 96706.

```
dotnet run --project src/LastBreath.Lab -c Release -- export-pool --dive static --tickets 100000
```

The tests check each rule of each dive against scripted random numbers, and a few full rounds from fixed seeds. The solver tests check hand-worked cases, the Drift closed form against its induction, Tank with no tanks and a refill against Classic, and each solver against 200,000 rounds of its engine. The simulator tests run 20,000 rounds of each dive with a pinned seed and check that a wrong exact value makes a check fail, and the export tests check that 2,000 tickets validate and that one tampered ticket makes the export fail. The tuner tests check that the config numerators are the closest integers, that a search from another numerator lands on the same one, and that Drift agrees with its closed form. The client does not play a round yet.

The numbers in the config are first-pass values, and I have not tuned them. The solver reports show what they give, but I make no claim about RTP or any other math figure here until the full simulation backs them up.

## Build and test

Needs the .NET 8 SDK or newer.

```
dotnet build LastBreath.sln -c Release
dotnet test LastBreath.sln -c Release
dotnet run --project src/LastBreath.Web
```

The tests carry a category: `Common` for the core, `Classic`, `Drift` and `Tank` for the engines, and `Analysis` for the solvers. For example, `dotnet test LastBreath.sln -c Release --filter Category=Tank` runs only the Tank tests.

## License

MIT, see `LICENSE`.
