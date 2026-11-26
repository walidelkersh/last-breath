using LastBreath.Core;
using LastBreath.Core.Dives;
using LastBreath.Web;

namespace LastBreath.Tests;

[Trait("Category", "Client")]
public sealed class ReplayTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    // A +2 air tank in cell 0 and a 50-unit crate in cell 1 on the first spin, then five dead spins
    // while the breaths run 5, 4, 3, 2, 1, 0. Cell 0 is empty again once the tank has cleared.
    private static Round TankRoundWithOneTank()
    {
        int[] rolls =
        [
            101_120, .. Rolls.Crate(), .. Rolls.Miss(13),
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),
        ];
        return TankDive.Play(Default, Default.Dives["Tank"], new ScriptedRandom(rolls));
    }

    [Fact]
    public void EachSpinKnowsWhatLandedAndTheClockEitherSideOfIt()
    {
        var spins = Replay.Of(TankRoundWithOneTank(), Default.Dives["Tank"]);

        Assert.Equal(6, spins.Length);
        Assert.Equal([1], spins[0].NewCells);
        Assert.Equal((4, 5, 2), (spins[0].ClockBefore, spins[0].ClockAfter, spins[0].TanksLeft));
        Assert.Single(spins[0].AirTanks);
        Assert.Empty(spins[1].NewCells);
        Assert.Equal(5, spins[1].ClockBefore);
        Assert.Equal(0, spins[5].ClockAfter);
        Assert.Equal(50, spins[5].BoardUnits);
    }

    [Fact]
    public void ATankSpinIsDescribedWithItsBreathsAndTheSpareTanksLeft()
    {
        var spins = Replay.Of(TankRoundWithOneTank(), Default.Dives["Tank"]);

        Assert.Equal(
            "Spin 1. Landed: 1 crate worth 0.05 credits. Air tank, plus 2 breaths. Board 0.05 credits. Air 5. Spare tanks 2 of 3.",
            Narration.Landing(Default, "Tank", 1.00m, spins[0]));
    }

    [Fact]
    public void TheStatusColumnNamesWhatLandedAndDoesNotCallAnAirTankNothing()
    {
        var spins = Replay.Of(TankRoundWithOneTank(), Default.Dives["Tank"]);
        var tankOnly = new Spin(1, new Cell[Board.Size], [], spins[0].AirTanks, 4, 5, 2);

        Assert.Equal("Landed: 1 crate worth 0.05 credits. Air tank, plus 2 breaths.", Narration.Latest(Default, 1.00m, spins[0]));
        Assert.Equal("Air tank, plus 2 breaths.", Narration.Latest(Default, 1.00m, tankOnly));
        Assert.Equal("Nothing landed.", Narration.Latest(Default, 1.00m, spins[1]));
    }

    [Fact]
    public void ADeadSpinOnTheLastBreathSaysSo()
    {
        var spin = new Spin(3, new Cell[Board.Size], [], [], 2, 1, 0);

        Assert.Equal(
            "Spin 3. Nothing landed. Board 0.00 credits. Oxygen 1 of 3. Last breath.",
            Narration.Landing(Default, "Classic", 1.00m, spin));
    }

    [Fact]
    public void AJackpotIsNamedAndPricedAtTheBet()
    {
        var cells = new Cell[Board.Size];
        cells[0] = new Cell(CellKind.Jackpot, 20_000);
        var spin = new Spin(1, cells, [0], [], 6, 5, 0);

        Assert.Equal(
            "Spin 1. Landed: a Minor worth 40.00 credits. Board 40.00 credits. Spins left 5 of 6.",
            Narration.Landing(Default, "Static", 2.00m, spin));
    }

    [Fact]
    public void TheResultStatesTheWinInCreditsAndAsAMultipleOfTheBet()
    {
        var outcome = new RoundSummary(7, 3, ["Mini"], false, 5_150);

        Assert.Equal(
            "Round over after 7 spins. Crates 3, jackpots Mini. Grand not won. Total win 10.30 credits, 5.15 times the bet.",
            Narration.Result(Default, 2.00m, outcome, skipped: false));
        Assert.StartsWith("Skipped to the end. ", Narration.Result(Default, 2.00m, outcome, skipped: true));
    }

    [Fact]
    public void AFullBoardIsSummarisedWithTheGrand()
    {
        var round = ClassicDive.Play(Default, Default.Dives["Classic"], new ScriptedRandom(Rolls.Crates(15)));

        var outcome = Replay.Summary(Default, round);

        Assert.Equal((1, 15, true, 1_000_750), (outcome.Spins, outcome.Crates, outcome.Grand, outcome.Units));
        Assert.Empty(outcome.Jackpots);
        Assert.Equal(
            "Round over after 1 spin. Crates 15, jackpots none. Grand won, 1,000.00 credits. Total win 1,000.75 credits, 1,000.75 times the bet.",
            Narration.Result(Default, 1.00m, outcome, skipped: false));
    }
}
