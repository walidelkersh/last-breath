using LastBreath.Core;
using LastBreath.Web;

namespace LastBreath.Tests;

[Trait("Category", "Client")]
public sealed class TickerTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static Spin Empty(int number) => new(number, new Cell[Board.Size], [], [], 3, 2, 0);

    private static Spin Crate(int number, int index)
    {
        var cells = new Cell[Board.Size];
        cells[index] = new Cell(CellKind.Cash, 250);
        return new Spin(number, cells, [index], [], 2, 3, 0);
    }

    [Fact]
    public void ARunOfEmptySpinsIsOneRowAndASpinThatLandedSomethingIsItsOwn()
    {
        Spin[] spins = [Crate(1, 0), Empty(2), Empty(3), Empty(4), Crate(5, 1), Empty(6)];

        var rows = Narration.Ticker(Default, 1.00m, spins, 6).ToArray();

        Assert.Equal(["Spin 6", "Spin 5", "Spins 2 to 4", "Spin 1"], rows.Select(row => row.Label));
        Assert.Equal(["Nothing landed", "1 crate, 0.25", "Nothing landed", "1 crate, 0.25"], rows.Select(row => row.What));
    }

    [Fact]
    public void ARunThatIsStillGrowingKeepsItsKeySoTheRowIsUpdatedAndNotReplaced()
    {
        Spin[] spins = [Crate(1, 0), Empty(2), Empty(3), Empty(4)];

        var two = Narration.Ticker(Default, 1.00m, spins, 3).First();
        var three = Narration.Ticker(Default, 1.00m, spins, 4).First();

        Assert.Equal("Spins 2 to 3", two.Label);
        Assert.Equal("Spins 2 to 4", three.Label);
        Assert.Equal(two.Key, three.Key);
    }

    [Fact]
    public void ASpinThatOnlyLandedAnAirTankIsNotEmpty()
    {
        var tank = new Spin(1, new Cell[Board.Size], [], [new Landed(2, Outcome.TankPlus1, default)], 4, 4, 2);

        Assert.False(Narration.IsEmpty(tank));
        Assert.True(Narration.IsEmpty(Empty(2)));
        Assert.Equal("Air tank, +1 breath", Assert.Single(Narration.Ticker(Default, 1.00m, [tank], 1)).What);
    }

    [Fact]
    public void NothingYetHasNoRows()
    {
        Assert.Empty(Narration.Ticker(Default, 1.00m, [Empty(1)], 0));
    }
}
