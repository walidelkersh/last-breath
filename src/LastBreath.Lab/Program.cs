using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using LastBreath.Core;
using LastBreath.Core.Analysis;
using LastBreath.Core.Dives;
using LastBreath.Core.Tickets;

CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;

const string usage = """
    usage: lab <command>

    commands:
      play --dive <classic|static|tank> --seed <number>
          Plays one round and prints every spin. Static is the Drift dive.
          Amounts are units, where one unit is a thousandth of the bet.
      solve --dive <classic,static,tank> | --all
          Solves each dive exactly and writes reports/solve-<dive>.json.
          Money in a report is a multiple of the bet.
      simulate --dive <classic,static,tank> --rounds <number> --seed <number>
          Plays the rounds with the real engine and checks the result against the exact solve:
          the mean award, hit frequency and mean spins within 3 standard errors, and chi-squares
          of the final crate count and of 12 award buckets. The first million rounds are also
          turned into tickets and validated. Writes reports/simulate-<dive>.json and exits 1
          if any check fails.
      export-pool --dive <classic,static,tank> --tickets <number> [--seed <number>]
          Plays the rounds, turns each into a ticket, validates every ticket and fails unless all pass.
          Writes reports/pool/<dive>/TicketPool.json and PoolReport.txt. The seed defaults to 96706.
      tune --dive <classic,static,tank>
          Searches the exact solver for the integer crate numerator that puts each dive closest to a
          96% RTP, and reports the old and new numerator. It does not change the config.
    """;

if (args is ["-h" or "--help"])
{
    Console.WriteLine(usage);
    return 0;
}

if (args is ["play", ..])
    return Play();

if (args is ["solve", ..])
    return Solve();

if (args is ["simulate", ..])
    return Simulate();

if (args is ["export-pool", ..])
    return ExportPool();

if (args is ["tune", ..])
    return Tune();

if (args.Length > 0)
    Console.Error.WriteLine($"unknown command: {args[0]}");
Console.Error.WriteLine(usage);
return 1;

string? Option(string name)
{
    var at = Array.IndexOf(args, name);
    return at >= 0 && at + 1 < args.Length ? args[at + 1] : null;
}

string? KeyOf(string name) => name.ToLowerInvariant() switch
{
    "classic" => "Classic",
    "static" or "drift" => "Static",
    "tank" => "Tank",
    _ => null,
};

// The dives named in --dive as config keys, or null once the problem has been printed.
string[]? ChosenDives()
{
    var names = Option("--dive")?.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
    if (names is null or [])
    {
        Console.Error.WriteLine(usage);
        return null;
    }

    var keys = names.Select(KeyOf).ToArray();
    var unknown = Array.FindIndex(keys, key => key is null);
    if (unknown >= 0)
    {
        Console.Error.WriteLine($"unknown dive: {names[unknown]}");
        return null;
    }
    return keys!;
}

int Play()
{
    if (ChosenDives() is not { } chosen) return 1;
    if (chosen is not [var key] || !ulong.TryParse(Option("--seed"), out var seed))
    {
        Console.Error.WriteLine(usage);
        return 1;
    }

    var config = ConfigLoader.LoadDefault();
    var dive = config.Dives[key];
    var round = Engines.For(key)(config, dive, new Pcg32Random(seed));
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

int Solve()
{
    var config = ConfigLoader.LoadDefault();
    var keys = args.Contains("--all") ? [.. config.Dives.Keys] : ChosenDives();
    if (keys is null) return 1;

    var solved = keys.Select(key => (Name: key.ToLowerInvariant(), Solution: Solvers.Solve(key, config, config.Dives[key]))).ToList();

    Directory.CreateDirectory("reports");
    foreach (var (name, solution) in solved)
    {
        var report = new
        {
            dive = name,
            rtp = solution.Rtp,
            e_a2 = solution.SecondMoment,
            sd = solution.Sd,
            hit_frequency = solution.HitFrequency,
            mean_spins = solution.MeanSpins,
            grand_probability = solution.GrandProbability,
            reachable_max = solution.ReachableMax,
            final_crate_probabilities = solution.FinalCrates,
            mean_crates = solution.MeanCrates,
            coin_mean = solution.CoinMean,
            coin_variance = solution.CoinVariance,
            config_hash = config.Hash(),
        };
        var path = Path.Combine("reports", $"solve-{name}.json");
        File.WriteAllText(path, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }) + "\n");
        Console.WriteLine($"{name}: rtp {solution.Rtp:F6}, sd {solution.Sd:F4}, hit {solution.HitFrequency:P3}, " +
            $"spins {solution.MeanSpins:F4}, grand 1 in {1 / solution.GrandProbability:N0}, max {solution.ReachableMax:N0}x, wrote {path}");
    }
    return 0;
}

int Simulate()
{
    if (ChosenDives() is not { } keys) return 1;
    if (!long.TryParse(Option("--rounds"), out var rounds) || rounds < Simulator.MinimumRounds
        || !ulong.TryParse(Option("--seed"), out var seed))
    {
        Console.Error.WriteLine(usage);
        return 1;
    }

    var config = ConfigLoader.LoadDefault();
    Directory.CreateDirectory("reports");

    // Each dive has its own stream, so running them side by side changes nothing but the time.
    var runs = keys.AsParallel().AsOrdered().Select(key =>
    {
        var clock = Stopwatch.StartNew();
        var report = Simulator.Run(key, config, Solvers.Solve(key, config, config.Dives[key]), rounds, seed);
        return (Key: key, Report: report, Seconds: clock.Elapsed.TotalSeconds);
    }).ToList();

    foreach (var (key, report, seconds) in runs)
    {
        var path = Path.Combine("reports", $"simulate-{report.Dive}.json");
        File.WriteAllText(path, report.ToJson());

        Console.WriteLine($"{config.Dives[key].Name}, {report.Rounds:N0} rounds, seed {report.Seed}, {seconds:F1} s");
        Console.WriteLine($"  {"",-24}{"simulated",12}{"exact",12}{"SE",11}{"z",8}");
        PrintMeasure("mean award", report.MeanAward);
        PrintMeasure("mean award, 100 batches", report.MeanAwardByBatches);
        PrintMeasure("hit frequency", report.HitFrequency);
        PrintMeasure("mean spins", report.MeanSpins);
        Console.WriteLine($"  99% CI of the mean: textbook {report.MeanAward.Low99:F6} to {report.MeanAward.High99:F6}, " +
            $"batch means {report.MeanAwardByBatches.Low99:F6} to {report.MeanAwardByBatches.High99:F6}");
        Console.WriteLine($"  award SD {report.AwardSd:F4} (exact {report.ExactAwardSd:F4}), spins variance {report.SpinVariance:F6}");
        PrintChiSquare("final crate count", report.FinalCrates);
        PrintChiSquare("award in 12 buckets", report.Award);
        Console.WriteLine($"  tickets: {report.TicketsChecked - report.TicketsInvalid:N0} of {report.TicketsChecked:N0} rounds validate" +
            (report.FirstInvalidTicket is null ? "" : $", the first failure was {report.FirstInvalidTicket}"));
        Console.WriteLine("  bucket edges, in multiples of the bet, both ends included: " +
            string.Join(", ", report.AwardBuckets.Select(bucket => $"{bucket.From:0.##} to {bucket.To:0.##}")));
        Console.WriteLine($"  {(report.Passed ? "all checks pass" : "A CHECK FAILED")}, wrote {path}");
    }

    return runs.All(run => run.Report.Passed) ? 0 : 1;

    static void PrintMeasure(string name, Measure measure) =>
        Console.WriteLine($"  {name,-24}{measure.Simulated,12:F6}{measure.Exact,12:F6}{measure.StandardError,11:G3}{measure.Z,8:F2}  {(measure.WithinThreeSe ? "pass" : "FAIL")}");

    static void PrintChiSquare(string name, ChiSquare test) =>
        Console.WriteLine($"  {name}: chi-square {test.Statistic:F2} on {test.Freedom} df, limit {test.Limit} (0.001 level), {(test.Passed ? "pass" : "FAIL")}");
}

int ExportPool()
{
    if (ChosenDives() is not { } keys) return 1;
    ulong seed = 96706;
    if (!long.TryParse(Option("--tickets"), out var count) || count < Simulator.MinimumRounds
        || (Option("--seed") is { } given && !ulong.TryParse(given, out seed)))
    {
        Console.Error.WriteLine(usage);
        return 1;
    }

    var config = ConfigLoader.LoadDefault();
    foreach (var key in keys)
    {
        var directory = Path.Combine("reports", "pool", key.ToLowerInvariant());
        var exact = Solvers.Solve(key, config, config.Dives[key]);
        try
        {
            var report = PoolExport.Write(key, config, exact, PoolExport.Play(key, config, count, seed), seed, directory);
            Console.WriteLine($"{report.DiveName}: {report.Valid} of {report.Count} valid, mean TotalWin {report.MeanTotalWin.Simulated:F4} " +
                $"against exact {report.MeanTotalWin.Exact:F4}, hit frequency {report.HitFrequency.Simulated:F5}, wrote {directory}");
        }
        catch (InvalidDataException failure)
        {
            Console.Error.WriteLine($"{config.Dives[key].Name}: {failure.Message}");
            return 1;
        }
    }
    return 0;
}

int Tune()
{
    if (ChosenDives() is not { } keys) return 1;

    var config = ConfigLoader.LoadDefault();
    foreach (var key in keys)
    {
        var tuning = Tuner.Tune(key, config);
        var change = tuning.New == tuning.Old ? "unchanged" : "changed";
        Console.WriteLine($"{config.Dives[key].Name}: numerator {tuning.Old:N0} to {tuning.New:N0} ({change}), " +
            $"RTP {tuning.RtpBefore * 100:F6}% to {tuning.RtpAfter * 100:F6}%, " +
            $"distance from 96% {Math.Abs(tuning.RtpBefore - Tuner.Target) * 100:F6} pp to {Math.Abs(tuning.RtpAfter - Tuner.Target) * 100:F6} pp");
    }
    return 0;
}
