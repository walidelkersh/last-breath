# Last Breath

Last Breath is a hold-and-spin game with no reels and no base game. Each bet buys one dive, which is a full hold-and-spin round on an empty 5x3 board. Coins that land stay in their cell, and a clock of breaths decides when the round ends. I am writing it in C#, and I want the exact math to be the source of truth, with simulation used only to check the engine.

## Status

Very little exists yet. So far there is:

- a solution with a core library, a console project called the lab, a Blazor WebAssembly client and an xUnit test project
- the PCG32 random source, with tests against its reference output
- `config/dives.json`, which holds the cash ladder, the jackpots, the bets, three weight tables, and the landing and clock parameters for the first three dives (Classic, Drift and Tank)
- a client page that shows the game name and nothing else

The lab only prints its usage. There are no dive engines and nothing is playable.

The numbers in the config are first-pass values, and I have not tuned or verified them. I make no claim about RTP or any other math figure yet, because I have nothing to back one up.

## Build and test

Needs the .NET 8 SDK or newer.

```
dotnet build LastBreath.sln -c Release
dotnet test LastBreath.sln -c Release
dotnet run --project src/LastBreath.Web
```

## License

MIT, see `LICENSE`.
