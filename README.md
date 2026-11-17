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
- a client page that shows the game name and nothing else
- `scripts/independent_check.py`, a Python check written from the rules alone that works out each dive's exact math in fractions and compares it with the solver reports once they exist: `python -I scripts/independent_check.py --dives classic,static,tank`, or `--self-test` for its hand-checked cases

All three engines end the round at once when the board is full, and a full board pays the Grand on top of the board total.

Money is held as whole units, where one unit is a thousandth of the bet, and it only becomes credits at settlement. No floating point touches a payout.

To watch one round, give the lab a dive and a seed. The dive is `classic`, `static` or `tank`, and the same seed always plays the same round. The lab prints each spin with the board after it, in units.

```
dotnet run --project src/LastBreath.Lab -c Release -- play --dive tank --seed 54
```

The tests check each rule of each dive against scripted random numbers, and a few full rounds from fixed seeds. The client does not play a round yet, and there is no simulator or exact solver.

The numbers in the config are first-pass values, and I have not tuned or verified them. I make no claim about RTP or any other math figure yet, because I have nothing to back one up.

## Build and test

Needs the .NET 8 SDK or newer.

```
dotnet build LastBreath.sln -c Release
dotnet test LastBreath.sln -c Release
dotnet run --project src/LastBreath.Web
```

The tests carry a category: `Common` for the core, and `Classic`, `Drift` and `Tank` for the engines. For example, `dotnet test LastBreath.sln -c Release --filter Category=Tank` runs only the Tank tests.

## License

MIT, see `LICENSE`.
