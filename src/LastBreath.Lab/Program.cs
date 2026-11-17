using LastBreath.Core;
using LastBreath.Core.Dives;

const string usage = """
    usage: lab <command>

    commands:
      play --dive <classic|static|tank> --seed <number>
          Plays one round and prints every spin. Static is the Drift dive.
          Amounts are units, where one unit is a thousandth of the bet.
    """;

if (args is ["-h" or "--help"])
{
    Console.WriteLine(usage);
    return 0;
}

if (args is ["play", ..])
    return Play();

if (args.Length > 0)
    Console.Error.WriteLine($"unknown command: {args[0]}");
Console.Error.WriteLine(usage);
return 1;

string? Option(string name)
{
    var at = Array.IndexOf(args, name);
    return at >= 0 && at + 1 < args.Length ? args[at + 1] : null;
}

int Play()
{
    var diveName = Option("--dive");
    if (diveName is null || !ulong.TryParse(Option("--seed"), out var seed))
    {
        Console.Error.WriteLine(usage);
        return 1;
    }

    var config = ConfigLoader.LoadDefault();
    (string Key, Func<GameConfig, DiveConfig, IRandomSource, Round> Engine)? chosen = diveName.ToLowerInvariant() switch
    {
        "classic" => ("Classic", ClassicDive.Play),
        "static" or "drift" => ("Static", DriftDive.Play),
        "tank" => ("Tank", TankDive.Play),
        _ => null,
    };
    if (chosen is not var (key, engine))
    {
        Console.Error.WriteLine($"unknown dive: {diveName}");
        return 1;
    }

    var dive = config.Dives[key];
    var round = engine(config, dive, new Pcg32Random(seed));
    var clockName = key == "Static" ? "spins" : "breaths";

    Console.WriteLine($"{dive.Name}, seed {seed}");
    for (var spin = 1; spin <= round.Turns.Count; spin++)
    {
        var turn = round.Turns[spin - 1];
        Console.WriteLine($"spin {spin}: won {turn.TurnWin}, {clockName} left {turn.ClockAfter}");
        foreach (var tank in turn.AirTanks)
            Console.WriteLine($"  air tank +{tank.Outcome.Breaths()} landed in cell {tank.Index} and cleared");
        for (var row = 0; row < Board.Rows; row++)
        {
            var cells = Enumerable.Range(0, Board.Columns).Select(column => turn.Cells[Board.Index(column, row)]);
            Console.WriteLine("  " + string.Join(' ', cells.Select(cell => (cell.IsEmpty ? "." : cell.Units.ToString()).PadLeft(6))));
        }
    }

    Console.WriteLine($"board {round.CoinWin}, grand {round.GrandWin}, award {round.Award}");
    return 0;
}
