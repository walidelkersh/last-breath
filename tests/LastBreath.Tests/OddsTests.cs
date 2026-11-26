using LastBreath.Core;
using LastBreath.Web;

namespace LastBreath.Tests;

[Trait("Category", "Client")]
public sealed class OddsTests
{
    [Theory]
    [InlineData(4.755, "5")]
    [InlineData(7.39, "7")]
    [InlineData(2.94, "3")]
    [InlineData(9.96, "10")]
    [InlineData(10.1, "10")]
    [InlineData(44.05, "44")]
    [InlineData(344.8, "340")]
    [InlineData(5_000.0, "5,000")]
    [InlineData(81_037.0, "81,000")]
    [InlineData(1_250_000.0, "1,300,000")]
    public void AFigureBelowTenIsWholeAndAboveItHasTwoSignificantDigits(double every, string printed)
    {
        Assert.Equal(printed, Odds.Rounded(every));
    }

    [Fact]
    public void ClassicEndingWithNothingIsAboutOneInFiveAndPartOfTheNinetySixPercent()
    {
        Assert.Equal(
            "About 1 in 5 Classic dives surfaces with nothing, and that is part of the 96%.",
            Odds.Line("Classic Dive", 0.960019, 0, 0.2103));
    }

    [Fact]
    public void AnEndingWithCratesNamesTheDiveAndTheCountAndSaysOneTimeIn()
    {
        Assert.Equal("A Classic dive ends with exactly 9 crates about 1 time in 44.", Odds.Line("Classic Dive", 0.96, 9, 0.0227));
        Assert.Equal("A Drift dive ends with exactly 1 crate about 1 time in 220.", Odds.Line("Drift Dive", 0.96, 1, 0.0046));
        Assert.Equal("A Tank dive ends with exactly 14 crates about 1 time in 5,000.", Odds.Line("Tank Dive", 0.96, 14, 0.0002));
    }

    [Fact]
    public void ARoundThatIsMoreLikelyThanNotNeverPrintsAFractionBelowOne()
    {
        Assert.Equal("A Classic dive ends with exactly 2 crates more often than not.", Odds.Line("Classic Dive", 0.96, 2, 0.8));
        Assert.Equal("More than half of all Classic dives surface with nothing, and that is part of the 96%.", Odds.Line("Classic Dive", 0.96, 0, 0.6));
    }

    [Fact]
    public void AnImpossibleEndingHasNoLine()
    {
        Assert.Null(Odds.Line("Classic Dive", 0.96, 15, 0));
    }

    [Theory]
    [InlineData("Classic", 0, "About 1 in 5 Classic dives surfaces with nothing, and that is part of the 96%.")]
    [InlineData("Static", 9, "A Drift dive ends with exactly 9 crates about 1 time in 16.")]
    [InlineData("Tank", 5, "A Tank dive ends with exactly 5 crates about 1 time in 5.")]
    public void TheLineUsesTheFigureOfTheDiveFromItsOwnReport(string id, int crates, string line)
    {
        var dive = Catalog.Load(ConfigLoader.LoadDefault()).First(info => info.Id == id);

        Assert.Equal(line, Odds.Line(dive.Name, dive.Figures.Rtp, crates, dive.Figures.FinalCrates[crates]));
    }
}
