using LastBreath.Core;
using LastBreath.Core.Tickets;
using static LastBreath.Tests.TicketFixtures;

namespace LastBreath.Tests;

// The rules that differ by dive: dead runs and the end of a Classic ticket, the turn count of a Static
// one, air tanks, and the clock replay that every dive has.
[Trait("Category", "Tickets")]
public sealed class TicketDiveRuleTests
{
    private static Ticket ThreeDeadClassicTurns() => Scripted("Classic", Rolls.Miss(45));

    private static Ticket FourDeadTankTurns() => Scripted("Tank", Rolls.Miss(60));

    [Fact]
    public void AFourthDeadSpinInARowFailsInClassic()
    {
        var ticket = ThreeDeadClassicTurns().Append(-1);

        Fails(ticket, "Dead in a row count exceeded at turn 4. Maximum allowed is 3, but found 4.");
    }

    [Fact]
    public void AHitAfterThreeDeadSpinsFailsInClassic()
    {
        var ticket = ThreeDeadClassicTurns().Append(3, (0, 0, 50));

        Fails(ticket, "Dead in a row count exceeded before a hit at turn 4. Maximum allowed is 2, but found 3.");
    }

    [Fact]
    public void AClassicTicketThatStopsBeforeThreeDeadSpinsFails()
    {
        var ticket = ClassicBase().WithoutLastTurn();

        Fails(ticket, "Dead in a row count must be equal to 3 when board total is not 15. Found: 2.");
    }

    [Theory]
    [InlineData("Classic", 2)]
    [InlineData("Static", 4)]
    [InlineData("Tank", 2)]
    public void ATicketWithAFullBoardMustEndOnTheTurnThatFilledIt(string feature, int clockAfterDeadTurn)
    {
        var ticket = Scripted(feature, Rolls.Crates(15)).Append(clockAfterDeadTurn);

        Fails(ticket, "Last turn must have had new coins when board total is 15.");
    }

    [Fact]
    public void AClassicTicketWhoseClockDidNotRefillFails()
    {
        var ticket = ClassicBase();
        ticket.Turn(2).ClockAfter = 2;

        Fails(ticket, "Clock mismatch at turn 2. Expected: 3, Found: 2.");
    }

    [Fact]
    public void AStaticTicketWithASeventhTurnFails()
    {
        var ticket = StaticBase().Append(-1);

        Fails(ticket, "For feature 'Static', expected at most 6 turns, but found 7.");
    }

    [Fact]
    public void AStaticTicketWithFewerThanSixTurnsFailsUnlessTheBoardFilled()
    {
        var ticket = StaticBase().WithoutLastTurn();

        Fails(ticket, "For feature 'Static', expected 6 turns unless the board fills, but found 5.");
    }

    [Fact]
    public void AStaticTicketWhoseClockSkippedFails()
    {
        var ticket = StaticBase();
        ticket.Turn(3).ClockAfter = 9;

        Fails(ticket, "Clock mismatch at turn 3. Expected: 3, Found: 9.");
    }

    [Fact]
    public void AStaticTicketThatFillsTheBoardOnTurnFiveIsShort()
    {
        // The golden Static seed 125,651 fills the board on its fifth spin with one spin to spare.
        var ticket = Seeded("Static", 125_651);

        Passes(ticket);
        Assert.Equal(5, ticket.FreeGamesTurns.Count);
    }

    [Fact]
    public void AClockThatMissesTheAirTanksFails()
    {
        var ticket = TankBase();
        ticket.Turn(1).ClockAfter = 4;

        Fails(ticket, "Clock mismatch at turn 1. Expected: 5, Found: 4.");
    }

    [Fact]
    public void AFourthAirTankInATicketFails()
    {
        var ticket = TankBase();
        ticket.Turn(1).AirTanks.AddRange([new AirTank(1, 0, 1), new AirTank(1, 1, 1), new AirTank(1, 2, 1)]);

        Fails(ticket, "Too many air tanks at turn 1. Maximum allowed is 3, but found 4.");
    }

    [Fact]
    public void AnAirTankOnACellThatHeldACoinFails()
    {
        var ticket = TankBase();
        ticket.Turn(2).AirTanks.Add(new AirTank(0, 1, 1));

        Fails(ticket, "Air tank landed on an occupied cell at turn 2, position (0, 1).");
    }

    [Fact]
    public void AnAirTankThatIsStillOnTheBoardFails()
    {
        var ticket = TankBase();
        ticket.Turn(2).AirTanks.Add(new AirTank(0, 0, 1));

        Fails(ticket, "Air tank is still on the board at turn 2, position (0, 0).");
    }

    [Fact]
    public void AnAirTankValueTheDiveNeverLandsFails()
    {
        var ticket = TankBase();
        ticket.Turn(1).AirTanks[0] = new AirTank(0, 0, 4);

        Fails(ticket, "Illegal air tank value 4 found at turn 1, position (0, 0).");
    }

    [Fact]
    public void AnAirTankOffTheBoardFails()
    {
        var ticket = TankBase();
        ticket.Turn(1).AirTanks[0] = new AirTank(5, 0, 2);

        Fails(ticket, "Air tank is off the board at turn 1, position (5, 0).");
    }

    [Fact]
    public void TwoAirTanksInOneCellFail()
    {
        var ticket = TankBase();
        ticket.Turn(1).AirTanks.Add(new AirTank(0, 0, 1));

        Fails(ticket, "Two air tanks share a cell at turn 1, position (0, 0).");
    }

    [Fact]
    public void ATankTicketThatContinuesAfterTheClockRanOutFails()
    {
        var ticket = FourDeadTankTurns().Append(-1);

        Fails(ticket, "Clock ran out at turn 4, but the ticket continues.");
    }

    [Fact]
    public void ATankTicketThatStopsWithBreathsLeftFails()
    {
        var ticket = FourDeadTankTurns().WithoutLastTurn();

        Fails(ticket, "Clock must be 0 when board total is not 15. Found: 1.");
    }

    [Fact]
    public void ATankOnTheLastBreathThatKeepsTheRoundGoingValidates()
    {
        // The golden Tank seed 21,694 lands a +2 tank with one breath left ("500/2(+2@2)" after "50/1").
        var ticket = Seeded("Tank", 21_694);

        Passes(ticket);
        Assert.Equal(1, ticket.FreeGamesTurns[4].ClockAfter);
        Assert.Equal(2, ticket.FreeGamesTurns[5].ClockAfter);
        Assert.Equal([new AirTank(0, 2, 2)], ticket.FreeGamesTurns[5].AirTanks);
    }
}
