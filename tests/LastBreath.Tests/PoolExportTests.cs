using System.Text.Json;
using LastBreath.Core;
using LastBreath.Core.Analysis;
using LastBreath.Core.Tickets;

namespace LastBreath.Tests;

[Trait("Category", "Simulate")]
public sealed class PoolExportTests : IDisposable
{
    private const int Tickets = 2_000;
    private const ulong Seed = 96706;

    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private readonly string _directory = Directory.CreateTempSubdirectory("lastbreath-pool-").FullName;

    public void Dispose() => Directory.Delete(_directory, true);

    private static Solution Exact(string id) => Solvers.Solve(id, Default, Default.Dives[id]);

    private PoolReport Export(string id, IEnumerable<Ticket> tickets, string? folder = null) =>
        PoolExport.Write(id, Default, Exact(id), tickets, Seed, Path.Combine(_directory, folder ?? id));

    [Theory]
    [InlineData("Classic")]
    [InlineData("Static")]
    [InlineData("Tank")]
    public void ExportOf2000TicketsValidatesEveryTicketAndWritesBothFiles(string id)
    {
        var report = Export(id, PoolExport.Play(id, Default, Tickets, Seed));

        Assert.Equal((Tickets, Tickets), (report.Count, report.Valid));
        var written = JsonDocument.Parse(File.ReadAllText(Path.Combine(_directory, id, "TicketPool.json"))).RootElement;
        Assert.Equal(Tickets, written.GetArrayLength());
        var validator = new TicketValidator(Default);
        validator.ValidatePool([.. written.EnumerateArray().Select(element => Ticket.FromJson(element.GetRawText()))]);
        Assert.Contains($"valid            {Tickets} of {Tickets}", File.ReadAllText(Path.Combine(_directory, id, "PoolReport.txt")));
    }

    [Fact]
    public void ATicketIdCarriesTheDiveTheSeedTheConfigHashAndItsPlace()
    {
        var ids = PoolExport.Play("Tank", Default, 3, Seed).Select(ticket => ticket.TicketId).ToList();

        var prefix = $"Tank-96706-{Default.Hash()[..8]}-";
        Assert.Equal([prefix + "0000001", prefix + "0000002", prefix + "0000003"], ids);
    }

    [Fact]
    public void TheReportMatchesWhatTheTicketsSay()
    {
        var tickets = PoolExport.Play("Classic", Default, Tickets, Seed).ToList();

        var report = Export("Classic", tickets);

        Assert.Equal(tickets.Average(ticket => ticket.TotalWin) / 1000, report.MeanTotalWin.Simulated, 1e-9);
        Assert.Equal(tickets.Average(ticket => ticket.FreeGamesTurns.Count), report.MeanTurns.Simulated, 1e-9);
        Assert.Equal(tickets.Count(ticket => ticket.TotalWin > 0) / (double)Tickets, report.HitFrequency.Simulated, 1e-12);
        Assert.Equal(tickets.Count(ticket => ticket.GrandWin > 0), report.GrandTickets);
        Assert.Equal(tickets.Max(ticket => ticket.TotalWin), report.LargestWin);
        Assert.Equal(tickets.First(ticket => ticket.TotalWin == report.LargestWin).TicketId, report.LargestTicketId);
        Assert.Equal(Tickets, report.Turns[0].Tickets);
        Assert.Equal(tickets.Average(ticket => ticket.FreeGamesTurns[0].TurnWin) / 1000, report.Turns[0].MeanWin, 1e-9);
        Assert.Equal(tickets.Sum(ticket => ticket.FreeGamesTurns.Count), report.Turns.Sum(turn => turn.Tickets));
        Assert.Equal(Tickets, report.AwardBuckets.Sum(bucket => bucket.Observed));
    }

    [Fact]
    public void TheSameSeedWritesTheSameFilesByteForByte()
    {
        Export("Static", PoolExport.Play("Static", Default, Tickets, Seed), "first");
        Export("Static", PoolExport.Play("Static", Default, Tickets, Seed), "second");

        foreach (var file in new[] { "TicketPool.json", "PoolReport.txt" })
            Assert.Equal(
                File.ReadAllBytes(Path.Combine(_directory, "first", file)),
                File.ReadAllBytes(Path.Combine(_directory, "second", file)));
    }

    [Fact]
    public void ATamperedTicketMakesTheExportFailAndLeavesNoPool()
    {
        var tickets = PoolExport.Play("Tank", Default, Tickets, Seed).Select((ticket, index) =>
        {
            if (index == 1_000) ticket.TotalWin += 50;
            return ticket;
        });

        var failure = Assert.Throws<InvalidDataException>(() => Export("Tank", tickets));

        Assert.Contains("1 of 2000 tickets failed validation", failure.Message);
        Assert.Contains("Total win mismatch", failure.Message);
        Assert.False(File.Exists(Path.Combine(_directory, "Tank", "TicketPool.json")));
        Assert.False(File.Exists(Path.Combine(_directory, "Tank", "PoolReport.txt")));
    }

    [Fact]
    public void ARepeatedTicketIdMakesTheExportFail()
    {
        var tickets = PoolExport.Play("Static", Default, Tickets, Seed).Select((ticket, index) =>
        {
            if (index == 7) ticket.TicketId = "Static-96706-same";
            if (index == 8) ticket.TicketId = "Static-96706-same";
            return ticket;
        });

        var failure = Assert.Throws<InvalidDataException>(() => Export("Static", tickets));

        Assert.Contains("duplicate ticket id", failure.Message);
    }

    [Fact]
    public void TooFewTicketsToTestAgainstTheExactSolveAreRefused()
    {
        Assert.Throws<ArgumentException>(() => Export("Classic", PoolExport.Play("Classic", Default, 3, Seed)));
        Assert.False(File.Exists(Path.Combine(_directory, "Classic", "TicketPool.json")));
    }
}
