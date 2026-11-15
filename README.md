# Last Breath

Last Breath is a hold-and-spin game with no reels and no base game. Each bet buys one dive, which is a full hold-and-spin round on an empty 5x3 board. Coins that land stay in their cell, and a clock of breaths decides when the round ends. I am writing it in C#, and I want the exact math to be the source of truth, with simulation used only to check the engine.

## Status

Only the common core exists. So far there is:

- a solution with a core library, a console project called the lab, a Blazor WebAssembly client and an xUnit test project
- the PCG32 random source, with tests against its reference output
- `config/dives.json`, which holds the cash ladder, the jackpots, the bets, three weight tables, and the landing and clock parameters for the first three dives (Classic, Drift and Tank)
- the config loader, which refuses a file unless each weight table sums to 100,000, each dive's landing numerators sum to at most 1,000,000, money values are multiples of 50 units and bets are multiples of 0.20
- the board, the landing draw with its fixed order of random numbers, settlement, and the round and turn model
- a client page that shows the game name and nothing else

Money is held as whole units, where one unit is a thousandth of the bet, and it only becomes credits at settlement. No floating point touches a payout.

The lab only prints its usage. There are no dive engines yet, so nothing is playable.

The numbers in the config are first-pass values, and I have not tuned or verified them. I make no claim about RTP or any other math figure yet, because I have nothing to back one up.

## Build and test

Needs the .NET 8 SDK or newer.

```
dotnet build LastBreath.sln -c Release
dotnet test LastBreath.sln -c Release
dotnet run --project src/LastBreath.Web
```

The tests for the common core carry the category `Common`, so `dotnet test LastBreath.sln -c Release --filter Category=Common` runs only those.

## License

MIT, see `LICENSE`.
