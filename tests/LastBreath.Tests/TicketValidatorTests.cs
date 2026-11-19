using LastBreath.Core;
using LastBreath.Core.Tickets;
using static LastBreath.Tests.TicketFixtures;

namespace LastBreath.Tests;

// Rules that every dive shares. The rules that differ by dive are in TicketDiveRuleTests.
[Trait("Category", "Tickets")]
public sealed class TicketValidatorTests
{
    private static readonly int[] MiniInClassic =
    [
        .. Rolls.Crate(99_500), .. Rolls.Miss(14),
        .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),
    ];

    public static TheoryData<string, ulong, int> GoldenRounds()
    {
        var data = new TheoryData<string, ulong, int>();
        foreach (var (feature, seed, award) in Golden)
            data.Add(feature, seed, award);
        return data;
    }

    [Theory]
    [MemberData(nameof(GoldenRounds))]
    public void TicketsFromTheGoldenRoundsValidate(string feature, ulong seed, int award)
    {
        var ticket = Seeded(feature, seed);

        Passes(ticket);
        Assert.Equal(award, ticket.TotalWin);
    }

    [Fact]
    public void ProblemIsNullForAValidTicketAndTheMessageOfTheFirstBrokenRuleOtherwise()
    {
        var ticket = Seeded("Tank", 54);

        Assert.Null(Validator.Problem(ticket));
        ticket.TotalWin += 50;
        Assert.Contains("Total win mismatch", Validator.Problem(ticket));
    }

    [Theory]
    [InlineData("Classic", false)]
    [InlineData("Static", false)]
    [InlineData("Tank", true)]
    public void ThreeThousandSeededRoundsAllValidateAsATicketPool(string feature, bool hasAirTanks)
    {
        var tickets = Enumerable.Range(1, 3_000).Select(seed => Seeded(feature, (ulong)seed)).ToList();

        foreach (var ticket in tickets)
            Passes(ticket);
        Validator.ValidatePool(tickets);
        Assert.Equal(hasAirTanks, tickets.Any(ticket => ticket.FreeGamesTurns.Any(turn => turn.AirTanks.Count > 0)));
    }

    [Theory]
    [InlineData("Classic")]
    [InlineData("Static")]
    [InlineData("Tank")]
    public void ANewCoinCountAboveTheOldPoolCapsIsLegal(string feature)
    {
        var ticket = Scripted(feature, Rolls.Crates(15));

        Passes(ticket);
        Assert.Equal(1_000_750, ticket.TotalWin);
    }

    [Fact]
    public void AMajorIsLegalInClassic()
    {
        var ticket = Scripted("Classic",
        [
            .. Rolls.Crate(99_999), .. Rolls.Miss(14),
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),
        ]);

        Passes(ticket);
        Assert.Equal(100_000, ticket.TotalWin);
    }

    [Fact]
    public void ATicketMustNotBeNull()
    {
        var thrown = Assert.Throws<ArgumentNullException>(() => Validator.ValidateTicket(null!));

        Assert.Equal("ticket", thrown.ParamName);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void TheFeatureNameMustNotBeEmpty(string? name)
    {
        var ticket = ClassicBase();
        ticket.FeatureName = name!;

        var thrown = Assert.Throws<ArgumentException>(() => Validator.ValidateTicket(ticket));

        Assert.Equal("FeatureName", thrown.ParamName);
    }

    [Fact]
    public void ATicketNeedsAtLeastOneTurn()
    {
        var ticket = ClassicBase();
        ticket.FreeGamesTurns.Clear();

        var thrown = Assert.Throws<ArgumentException>(() => Validator.ValidateTicket(ticket));

        Assert.Equal("FreeGamesTurns", thrown.ParamName);
    }

    [Fact]
    public void AMissingTurnListIsRefusedLikeAnEmptyOne()
    {
        var ticket = ClassicBase();
        ticket.FreeGamesTurns = null!;

        Assert.Equal("FreeGamesTurns", Assert.Throws<ArgumentException>(() => Validator.ValidateTicket(ticket)).ParamName);
    }

    [Fact]
    public void AnUnknownFeatureNameListsTheKnownOnes()
    {
        var ticket = ClassicBase();
        ticket.FeatureName = "Mystery";

        Fails(ticket, "Unknown feature name 'Mystery'. Expected one of: 'Classic', 'Static', 'Tank'.");
    }

    [Fact]
    public void ATicketThatDoesNotStartFromAnEmptyBoardFailsItsFirstTurnWin()
    {
        var ticket = ClassicBase();
        ticket.FreeGamesTurns.RemoveAt(0);

        Fails(ticket, "Turn win mismatch at turn 1. Expected: 350, Found: 200.");
    }

    [Fact]
    public void ACoinThatMovedFails()
    {
        var ticket = ClassicBase();
        ticket.Put(2, 0, 0, TicketSymbol.Empty, 0);
        ticket.Put(2, 1, 0, TicketSymbol.CashOnReel, 50);

        Fails(ticket, "Coin moved or changed at turn 2, position (0, 0).");
    }

    [Fact]
    public void ACoinThatChangedValueFails()
    {
        var ticket = ClassicBase();
        ticket.Put(2, 0, 1, TicketSymbol.CashOnReel, 250);

        Fails(ticket, "Coin moved or changed at turn 2, position (0, 1).");
    }

    [Fact]
    public void AJackpotThatDisappearedFails()
    {
        var ticket = Scripted("Classic", MiniInClassic);
        ticket.Put(2, 0, 0, TicketSymbol.Empty, 0);

        Fails(ticket, "Coin moved or changed at turn 2, position (0, 0).");
    }

    [Theory]
    [InlineData(75)]
    [InlineData(0)]
    public void ACashValueOffTheLadderFails(int value)
    {
        var ticket = ClassicBase();
        ticket.Put(1, 0, 0, TicketSymbol.CashOnReel, value);

        Fails(ticket, $"Illegal coin value {value} found at turn 1, position (0, 0).");
    }

    [Fact]
    public void AnEmptyCellWithAValueFails()
    {
        var ticket = ClassicBase();
        ticket.Put(1, 4, 2, TicketSymbol.Empty, 50);

        Fails(ticket, "Expected empty value at turn 1, position (4, 2), but found 50.");
    }

    // Captain is a symbol of a later dive, so it is unknown here.
    [Theory]
    [InlineData("Wild")]
    [InlineData("Captain")]
    public void ASymbolTheDiveDoesNotKnowFails(string symbol)
    {
        var ticket = ClassicBase();
        ticket.Put(1, 4, 2, symbol, 0);

        Fails(ticket, $"Unknown symbol '{symbol}' found at turn 1, position (4, 2).");
    }

    [Fact]
    public void AJackpotValueThatIsNotMiniMinorOrMajorFails()
    {
        var ticket = Scripted("Classic", MiniInClassic);
        ticket.Put(1, 0, 0, TicketSymbol.Jackpot, 7_000);

        Fails(ticket, "Illegal jackpot value 7000 found at turn 1, position (0, 0).");
    }

    [Fact]
    public void AMajorInStaticFailsBecauseItsTableHasNoMajor()
    {
        // Shallow tier roll 99,900 is the Mini.
        var ticket = Scripted("Static",
        [
            .. Rolls.Crate(99_900), .. Rolls.Miss(14),
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),
        ]);
        Passes(ticket);
        ticket.Put(1, 0, 0, TicketSymbol.Jackpot, 100_000);

        Fails(ticket, "Illegal jackpot value 100000 found at turn 1, position (0, 0).");
    }

    [Fact]
    public void ATurnWinThatIsNotTheChangeInTheBoardTotalFails()
    {
        var ticket = ClassicBase();
        ticket.Turn(1).TurnWin = 999;

        Fails(ticket, "Turn win mismatch at turn 1. Expected: 150, Found: 999.");
    }

    [Fact]
    public void ACoinWinThatIsNotTheSumOfTheTurnWinsFails()
    {
        var ticket = ClassicBase();
        ticket.CoinWin = 351;

        Fails(ticket, "Coin win mismatch. Expected: 351, Found: 350.");
    }

    [Fact]
    public void AFullBoardWithoutTheGrandFails()
    {
        var ticket = Scripted("Classic", Rolls.Crates(15));
        ticket.GrandWin = 0;

        Fails(ticket, "Grand win mismatch. Expected: 1000000, Found: 0.");
    }

    [Fact]
    public void AGrandOnABoardThatIsNotFullFails()
    {
        var ticket = ClassicBase();
        ticket.GrandWin = 1_000_000;

        Fails(ticket, "Grand win mismatch. Expected: 0, Found: 1000000.");
    }

    [Fact]
    public void ATotalWinThatIsNotCoinPlusGrandFails()
    {
        var ticket = ClassicBase();
        ticket.TotalWin = 351;

        Fails(ticket, "Total win mismatch. Expected: 350, Found: 351.");
    }

    [Fact]
    public void ATurnWithTheWrongBoardShapeFailsInsteadOfCrashing()
    {
        var ticket = ClassicBase();
        ticket.Turn(2).Symbols = [.. ticket.Turn(2).Symbols.Take(4)];

        Fails(ticket, "Turn 2 must have a 5 by 3 board and an air tank list.");
    }

    [Fact]
    public void ATurnWithoutAnAirTankListFails()
    {
        var ticket = ClassicBase();
        ticket.Turn(1).AirTanks = null!;

        Fails(ticket, "Turn 1 must have a 5 by 3 board and an air tank list.");
    }

    [Theory]
    [InlineData("Classic")]
    [InlineData("Static")]
    public void OnlyTheTankDiveHasAirTanks(string feature)
    {
        var ticket = feature == "Classic" ? ClassicBase() : StaticBase();
        ticket.Turn(1).AirTanks.Add(new AirTank(2, 0, 1));

        Fails(ticket, $"Feature '{feature}' cannot have air tanks, found 1 at turn 1.");
    }

    [Fact]
    public void ARepeatedTicketIdInAPoolFails()
    {
        var first = ClassicBase();
        var second = StaticBase();
        second.TicketId = first.TicketId;

        var thrown = Assert.Throws<InvalidOperationException>(() => Validator.ValidatePool([first, second]));

        Assert.Equal("Duplicate ticket id 'scripted' at ticket 2.", thrown.Message);
    }

    [Fact]
    public void APoolFailsOnTheFirstInvalidTicket()
    {
        var bad = ClassicBase();
        bad.CoinWin = 351;

        var thrown = Assert.Throws<InvalidOperationException>(() => Validator.ValidatePool([ClassicBase(), bad]));

        Assert.Equal("Coin win mismatch. Expected: 351, Found: 350.", thrown.Message);
    }

    [Fact]
    public void AConfigWithoutACashLadderIsRefused()
    {
        var thrown = Assert.Throws<ArgumentException>(() => new TicketValidator(Config with { CashLadder = [] }));

        Assert.Equal("config", thrown.ParamName);
    }
}
