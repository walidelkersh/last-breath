using System.Globalization;
using System.Text;
using LastBreath.Core.Analysis;
using LastBreath.Core.Dives;

namespace LastBreath.Core.Tickets;

// How many tickets reached a turn and what the board gained on it, on average.
public sealed record TurnAverage(int Turn, long Tickets, double MeanWin);

public sealed record PoolReport(
    string DiveName,
    long Count,
    ulong Seed,
    string ConfigHash,
    long Valid,
    Measure MeanTotalWin,
    Measure HitFrequency,
    Measure MeanTurns,
    ChiSquare FinalCrates,
    long GrandTickets,
    double ExpectedGrandTickets,
    int LargestWin,
    string LargestTicketId,
    AwardBucket[] AwardBuckets,
    TurnAverage[] Turns)
{
    public string ToText()
    {
        var text = new StringBuilder();
        var us = CultureInfo.InvariantCulture;
        text.AppendLine(us, $"Ticket pool, {DiveName}. Amounts are multiples of the bet.");
        text.AppendLine(us, $"tickets          {Count}");
        text.AppendLine(us, $"seed             {Seed}");
        text.AppendLine(us, $"config hash      {ConfigHash}");
        text.AppendLine(us, $"valid            {Valid} of {Count}");
        text.AppendLine();
        text.AppendLine(us, $"mean TotalWin    {MeanTotalWin.Simulated:F4}, standard error {MeanTotalWin.StandardError:F4}, 99% CI {MeanTotalWin.Low99:F4} to {MeanTotalWin.High99:F4}");
        text.AppendLine(us, $"exact mean       {MeanTotalWin.Exact:F4}, inside the interval: {(MeanTotalWin.Low99 <= MeanTotalWin.Exact && MeanTotalWin.Exact <= MeanTotalWin.High99 ? "yes" : "no")}");
        text.AppendLine(us, $"hit frequency    {HitFrequency.Simulated:F5}, exact {HitFrequency.Exact:F5}");
        text.AppendLine(us, $"mean turns       {MeanTurns.Simulated:F4}, exact {MeanTurns.Exact:F4}");
        text.AppendLine(us, $"Grand tickets    {GrandTickets}, expected {ExpectedGrandTickets:F2}");
        text.AppendLine(us, $"largest ticket   {LargestWin / 1000.0:F2} ({LargestTicketId})");
        text.AppendLine(us, $"final crate count: chi-square {FinalCrates.Statistic:F2} on {FinalCrates.Freedom} df, limit {FinalCrates.Limit} (0.001 level)");
        text.AppendLine();
        text.AppendLine("award histogram, both ends included");
        text.AppendLine(us, $"{"from",10}{"to",10}{"tickets",10}{"expected",12}");
        foreach (var bucket in AwardBuckets)
            text.AppendLine(us, $"{bucket.From,10:0.00}{bucket.To,10:0.00}{bucket.Observed,10}{bucket.Expected,12:F1}");
        text.AppendLine();
        text.AppendLine("average win by turn");
        text.AppendLine(us, $"{"turn",6}{"tickets",10}{"mean win",12}");
        foreach (var turn in Turns)
            text.AppendLine(us, $"{turn.Turn,6}{turn.Tickets,10}{turn.MeanWin,12:F4}");
        return text.ToString();
    }
}

public static class PoolExport
{
    // One PCG32 stream plays every ticket back to back, so a pool is rebuilt from its seed and length.
    // The id carries the seed, the start of the config hash and the ticket's place in the stream.
    public static IEnumerable<Ticket> Play(string id, GameConfig config, long count, ulong seed)
    {
        var dive = config.Dives[id];
        var play = Engines.For(id);
        var random = new Pcg32Random(seed);
        var hash = config.Hash();
        for (var number = 1L; number <= count; number++)
            yield return Ticket.FromRound(id, play(config, dive, random), $"{id}-{seed}-{hash[..8]}-{number:D7}", seed, hash);
    }

    // Validates each ticket as it arrives and writes it out. Unless every ticket is valid nothing is
    // left behind: the pool is deleted and the export throws.
    public static PoolReport Write(string id, GameConfig config, Solution exact, IEnumerable<Ticket> tickets, ulong seed, string directory)
    {
        Directory.CreateDirectory(directory);
        var poolPath = Path.Combine(directory, "TicketPool.json");
        var validator = new TicketValidator(config);
        var ids = new HashSet<string>();
        var tally = new Tally(config.Cap / ConfigLoader.UnitStep + 1);
        var turns = new List<(long Tickets, long Units)>();
        long count = 0, grand = 0;
        var largest = (Win: -1, Id: "");
        string? firstFailure = null;

        try
        {
            using (var pool = new StreamWriter(poolPath, false, new UTF8Encoding(false), 1 << 16))
            {
                pool.Write('[');
                foreach (var ticket in tickets)
                {
                    count++;
                    if (Failure(validator, ids, ticket) is { } failure)
                    {
                        firstFailure ??= failure;
                        continue;
                    }

                    pool.Write(count == 1 ? "\n" : ",\n");
                    pool.Write(ticket.ToJson());

                    var last = ticket.FreeGamesTurns[^1];
                    tally.Add(ticket.TotalWin, last.Symbols.Sum(column => column.Count(symbol => symbol != TicketSymbol.Empty)), ticket.FreeGamesTurns.Count);
                    if (ticket.GrandWin > 0) grand++;
                    if (ticket.TotalWin > largest.Win) largest = (ticket.TotalWin, ticket.TicketId);
                    for (var turn = 0; turn < ticket.FreeGamesTurns.Count; turn++)
                    {
                        if (turn == turns.Count) turns.Add((0, 0));
                        turns[turn] = (turns[turn].Tickets + 1, turns[turn].Units + ticket.FreeGamesTurns[turn].TurnWin);
                    }
                }
                pool.Write("\n]\n");
            }

            if (tally.Rounds < count)
                throw new InvalidDataException($"{count - tally.Rounds} of {count} tickets failed validation, the first was {firstFailure}");

            var buckets = tally.AwardBucketsAgainst(exact);
            var report = new PoolReport(
                config.Dives[id].Name,
                count,
                seed,
                config.Hash(),
                tally.Rounds,
                tally.MeanAwardAgainst(exact),
                tally.HitFrequencyAgainst(exact),
                tally.MeanSpinsAgainst(exact),
                tally.CratesAgainst(exact),
                grand,
                exact.GrandProbability * count,
                largest.Win,
                largest.Id,
                buckets,
                [.. turns.Select((turn, index) => new TurnAverage(index + 1, turn.Tickets, turn.Units / 1000.0 / turn.Tickets))]);
            File.WriteAllText(Path.Combine(directory, "PoolReport.txt"), report.ToText());
            return report;
        }
        catch
        {
            File.Delete(poolPath);
            throw;
        }
    }

    private static string? Failure(TicketValidator validator, HashSet<string> ids, Ticket ticket)
    {
        if (validator.Problem(ticket) is { } problem)
            return $"{ticket.TicketId}: {problem}";
        return ids.Add(ticket.TicketId) ? null : $"duplicate ticket id '{ticket.TicketId}'";
    }
}
