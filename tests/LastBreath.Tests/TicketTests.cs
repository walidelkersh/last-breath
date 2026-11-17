using System.Text.Json;
using LastBreath.Core;
using LastBreath.Core.Tickets;
using static LastBreath.Tests.TicketFixtures;

namespace LastBreath.Tests;

[Trait("Category", "Tickets")]
public sealed class TicketTests
{
    [Fact]
    public void ACrateLandsInTheColumnAndRowOfItsCell()
    {
        // Cell 7 is column 2, row 1 because cells run down a column first. Mixed tier roll 98,500 is 3,000 units.
        var ticket = Scripted("Classic",
        [
            .. Rolls.Miss(7), .. Rolls.Crate(98_500), .. Rolls.Miss(7),
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),
        ]);

        var first = ticket.FreeGamesTurns[0];

        Assert.Equal(TicketSymbol.CashOnReel, first.Symbols[2][1]);
        Assert.Equal(3_000, first.CashOnReels[2][1]);
        Assert.Equal(1, first.Symbols.SelectMany(column => column).Count(symbol => symbol != TicketSymbol.Empty));
        Assert.Equal(1, first.CashOnReels.SelectMany(column => column).Count(value => value != 0));
        Assert.Equal(3_000, first.TurnWin);
        Assert.Equal([3, 2, 1, 0], ticket.FreeGamesTurns.Select(turn => turn.ClockAfter));
    }

    [Fact]
    public void AJackpotKeepsItsOwnSymbol()
    {
        // Mixed tier roll 99,500 is the Mini, 5,000 units. Cell 3 is column 1, row 0.
        var ticket = Scripted("Classic",
        [
            .. Rolls.Miss(3), .. Rolls.Crate(99_500), .. Rolls.Miss(11),
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),
        ]);

        Assert.Equal(TicketSymbol.Jackpot, ticket.FreeGamesTurns[0].Symbols[1][0]);
        Assert.Equal(5_000, ticket.FreeGamesTurns[0].CashOnReels[1][0]);
        Assert.Equal((5_000, 0, 5_000), (ticket.CoinWin, ticket.GrandWin, ticket.TotalWin));
    }

    [Fact]
    public void AFullBoardAddsTheGrandToTheTotalAndKeepsTheClockTheEngineComputed()
    {
        var ticket = Scripted("Classic", Rolls.Crates(15));

        Assert.Single(ticket.FreeGamesTurns);
        Assert.Equal(3, ticket.FreeGamesTurns[0].ClockAfter);
        Assert.Equal((750, 1_000_000, 1_000_750), (ticket.CoinWin, ticket.GrandWin, ticket.TotalWin));
    }

    [Fact]
    public void AnAirTankIsRecordedByPositionAndLeavesTheBoardEmpty()
    {
        // A +3 tank in cell 7 (column 2, row 1) takes the clock from 4 to 4 - 1 + 3 = 6, so six more spins follow.
        var ticket = Scripted("Tank",
        [
            .. Rolls.Miss(7), 104_120, .. Rolls.Miss(7),
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),
        ]);

        var first = ticket.FreeGamesTurns[0];

        Assert.Equal([new AirTank(2, 1, 3)], first.AirTanks);
        Assert.All(first.Symbols.SelectMany(column => column), symbol => Assert.Equal(TicketSymbol.Empty, symbol));
        Assert.Equal(6, first.ClockAfter);
        Assert.Equal([6, 5, 4, 3, 2, 1, 0], ticket.FreeGamesTurns.Select(turn => turn.ClockAfter));
        Assert.Equal(0, ticket.TotalWin);
    }

    [Fact]
    public void TheTicketCarriesWhatTheCallerGaveIt()
    {
        var ticket = Seeded("Static", 2);

        Assert.Equal("Static", ticket.FeatureName);
        Assert.Equal("Static-2", ticket.TicketId);
        Assert.Equal(2UL, ticket.Seed);
        Assert.Equal(Config.Hash(), ticket.ConfigHash);
        Assert.Equal([0, 50, 0, 300, 100, 50], ticket.FreeGamesTurns.Select(turn => turn.TurnWin));
        Assert.Equal(500, ticket.TotalWin);
    }

    [Fact]
    public void AnUnfinishedRoundIsNotATicket()
    {
        var round = new Round(Config, Config.Dives["Classic"]);

        Assert.Throws<ArgumentException>(() => Ticket.FromRound("Classic", round, "id", 0, "hash"));
    }

    [Fact]
    public void ConfigHashFollowsTheNumbersNotTheFile()
    {
        var hash = Config.Hash();

        Assert.Equal(64, hash.Length);
        Assert.Equal(hash, ConfigLoader.LoadDefault().Hash());
        Assert.NotEqual(hash, (Config with { Grand = 2_000_000 }).Hash());
    }

    [Fact]
    public void JsonKeepsTheFieldNamesOfTheTicket()
    {
        var json = Scripted("Tank",
        [
            .. Rolls.Miss(7), 104_120, .. Rolls.Miss(7),
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),
        ]).ToJson();

        foreach (var name in new[] { "FreeGamesTurns", "TotalWin", "FeatureName", "TicketId", "CoinWin", "GrandWin", "Seed", "ConfigHash", "Symbols", "CashOnReels", "TurnWin", "ClockAfter", "AirTanks" })
            Assert.Contains($"\"{name}\":", json);
        Assert.Contains("\"AirTanks\":[{\"Col\":2,\"Row\":1,\"Plus\":3}]", json);
        Assert.Contains("\"FeatureName\":\"Tank\"", json);
    }

    [Fact]
    public void EveryGoldenTicketSurvivesAJsonRoundTrip()
    {
        foreach (var (feature, seed, _) in Golden)
        {
            var ticket = Seeded(feature, seed);

            var copy = Ticket.FromJson(ticket.ToJson());

            Assert.Equal(Describe(ticket), Describe(copy));
        }
    }

    [Fact]
    public void ALargeSeedSurvivesAJsonRoundTrip()
    {
        var ticket = Seeded("Classic", ulong.MaxValue);

        Assert.Equal(ulong.MaxValue, Ticket.FromJson(ticket.ToJson()).Seed);
    }

    [Fact]
    public void JsonWithAFieldTheTicketDoesNotHaveIsRefused()
    {
        Assert.Throws<JsonException>(() => Ticket.FromJson("""{ "TotalWin": 0, "Policy": "optimal" }"""));
    }

    [Fact]
    public void EmptyJsonIsRefused()
    {
        Assert.Throws<InvalidDataException>(() => Ticket.FromJson("null"));
    }
}
