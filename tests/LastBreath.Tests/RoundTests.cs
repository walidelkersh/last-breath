using LastBreath.Core;

namespace LastBreath.Tests;

[Trait("Category", "Common")]
public sealed class RoundTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static Round NewRound(string dive = "Classic") => new(Default, Default.Dives[dive]);

    private static void Fill(Board board, Cell cell)
    {
        for (var index = 0; index < Board.Size; index++) board[index] = cell;
    }

    [Theory]
    [InlineData("Classic", 3)]
    [InlineData("Static", 6)]
    [InlineData("Tank", 4)]
    public void RoundStartsEmptyWithTheDivesClock(string dive, int clock)
    {
        var round = NewRound(dive);

        Assert.Equal(clock, round.Clock);
        Assert.Equal(0, round.Board.Occupied);
        Assert.Empty(round.Turns);
        Assert.False(round.IsOver);
        Assert.Equal(0, round.Award);
    }

    [Fact]
    public void EndTurnRecordsABoardSnapshotTheChangeInTotalAndTheClock()
    {
        var round = NewRound();
        round.Board[0] = new Cell(CellKind.Cash, 50);
        round.Board[1] = new Cell(CellKind.Cash, 100);
        round.EndTurn(3);
        round.Board[2] = new Cell(CellKind.Jackpot, 5_000);
        round.EndTurn(3);
        round.EndTurn(2);

        Assert.Equal([150, 5_000, 0], round.Turns.Select(turn => turn.TurnWin));
        Assert.Equal([3, 3, 2], round.Turns.Select(turn => turn.ClockAfter));
        Assert.Equal(2, round.Clock);
        Assert.True(round.Turns[0].Cells[2].IsEmpty);
        Assert.Equal(new Cell(CellKind.Jackpot, 5_000), round.Turns[1].Cells[2]);
    }

    [Fact]
    public void EndTurnKeepsTheAirTanksOfTheSpinAndDefaultsToNone()
    {
        var round = NewRound("Tank");
        var tank = new Landed(4, Outcome.TankPlus2, default);

        round.EndTurn(5, [tank]);
        round.EndTurn(4);

        Assert.Equal([tank], round.Turns[0].AirTanks);
        Assert.Empty(round.Turns[1].AirTanks);
    }

    [Fact]
    public void ClockAtZeroEndsTheRound()
    {
        var round = NewRound();

        round.EndTurn(0);

        Assert.True(round.IsOver);
    }

    [Fact]
    public void FullBoardEndsTheRoundWithBreathsLeft()
    {
        var round = NewRound();
        Fill(round.Board, new Cell(CellKind.Cash, 50));

        Assert.Equal(3, round.Clock);
        Assert.True(round.IsOver);
    }

    [Fact]
    public void AwardIsTheBoardTotalAndNoGrandBeforeTheBoardIsFull()
    {
        var round = NewRound();
        round.Board[0] = new Cell(CellKind.Cash, 50);
        round.Board[1] = new Cell(CellKind.Jackpot, 20_000);

        Assert.Equal(20_050, round.CoinWin);
        Assert.Equal(0, round.GrandWin);
        Assert.Equal(20_050, round.Award);
    }

    [Fact]
    public void FullBoardAddsTheGrandOnTopOfTheBoardTotal()
    {
        var round = NewRound();
        Fill(round.Board, new Cell(CellKind.Cash, 50));

        Assert.Equal(750, round.CoinWin);
        Assert.Equal(1_000_000, round.GrandWin);
        Assert.Equal(1_000_750, round.Award);
    }

    [Fact]
    public void FifteenMajorsAndTheGrandPayTwoThousandFiveHundredTimesTheBet()
    {
        var round = NewRound();
        Fill(round.Board, new Cell(CellKind.Jackpot, 100_000));

        Assert.Equal(2_500_000, round.Award);
        Assert.False(round.Clamped);
    }

    [Fact]
    public void AwardAboveTheCapIsClampedAndReportedAsSuch()
    {
        var capped = Default with { Cap = 1_000_000 };
        var round = new Round(capped, capped.Dives["Classic"]);
        Fill(round.Board, new Cell(CellKind.Jackpot, 100_000));

        Assert.Equal(1_000_000, round.Award);
        Assert.True(round.Clamped);
    }

    [Fact]
    public void AwardExactlyAtTheCapIsNotClamped()
    {
        var capped = Default with { Cap = 2_500_000 };
        var round = new Round(capped, capped.Dives["Classic"]);
        Fill(round.Board, new Cell(CellKind.Jackpot, 100_000));

        Assert.Equal(2_500_000, round.Award);
        Assert.False(round.Clamped);
    }
}
