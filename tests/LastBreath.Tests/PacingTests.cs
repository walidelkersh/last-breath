using LastBreath.Core;
using LastBreath.Web;

namespace LastBreath.Tests;

[Trait("Category", "Client")]
public sealed class PacingTests
{
    private static Spin Spin(int clockAfter, Cell[] cells, int[] landed, Landed[]? tanks = null) =>
        new(1, cells, landed, tanks ?? [], clockAfter + 1, clockAfter, 0);

    private static Cell[] OnBoard(params (int Index, Cell Cell)[] filled)
    {
        var cells = new Cell[LastBreath.Core.Board.Size];
        foreach (var (index, cell) in filled) cells[index] = cell;
        return cells;
    }

    [Fact]
    public void ASpinWithNothingInItPassesQuickly()
    {
        Assert.Equal(450, Pacing.Pause(Spin(2, OnBoard(), [])));
    }

    [Fact]
    public void ASpinThatLandsCratesStaysLonger()
    {
        var cells = OnBoard((3, new Cell(CellKind.Cash, 100)), (4, new Cell(CellKind.Cash, 250)));

        Assert.Equal(800, Pacing.Pause(Spin(3, cells, [3, 4])));
    }

    [Fact]
    public void AJackpotStaysLongest()
    {
        var cells = OnBoard((3, new Cell(CellKind.Jackpot, 20_000)), (4, new Cell(CellKind.Cash, 250)));

        Assert.Equal(1300, Pacing.Pause(Spin(3, cells, [3, 4])));
    }

    [Fact]
    public void TheLastBreathStaysEvenWhenNothingLands()
    {
        Assert.Equal(1100, Pacing.Pause(Spin(1, OnBoard(), [])));
        Assert.Equal(1100, Pacing.Pause(Spin(1, OnBoard((3, new Cell(CellKind.Cash, 100))), [3])));
    }

    [Fact]
    public void AJackpotOnTheLastBreathIsStillTheLongest()
    {
        Assert.Equal(1300, Pacing.Pause(Spin(1, OnBoard((3, new Cell(CellKind.Jackpot, 5_000))), [3])));
    }

    [Fact]
    public void TheStartIsShorterThanAnyPauseThatFollowsACrate()
    {
        Assert.True(Pacing.StartMs < Pacing.CratesMs);
        Assert.True(Pacing.NothingMs < Pacing.CratesMs && Pacing.CratesMs < Pacing.LastBreathMs && Pacing.LastBreathMs < Pacing.JackpotMs);
    }
}
