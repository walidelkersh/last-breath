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

    // Awards of 0, 500, 1,000, 1,500 and 1,950 units, at 0.2, 0.3, 0.3, 0.15 and 0.05, so that every sum is easy to check.
    private static Survival Spread()
    {
        var award = new double[40];
        award[0] = 0.2;
        award[10] = 0.3;
        award[20] = 0.3;
        award[30] = 0.15;
        award[39] = 0.05;
        return new Survival(award);
    }

    [Fact]
    public void ARoundThatPaidNothingKeepsTheLineAboutOneInFiveAndPartOfTheNinetySixPercent()
    {
        Assert.Equal(
            "About 1 in 5 Classic dives surfaces with nothing, and that is part of the 96%.",
            Odds.Line("Classic Dive", 0.960019, 0, Spread()));
    }

    [Fact]
    public void ARoundUnderTheBetSaysHowManyInTenReturnLessThanTheBet()
    {
        // 0.2 of the dives pay nothing and 0.3 pay less than the bet, so 0.5 end under the bet. Leaving out the nothing, as the first version did, said 3.
        Assert.Equal("About 5 in 10 Classic dives return less than the bet.", Odds.Line("Classic Dive", 0.96, 500, Spread()));
    }

    [Theory]
    [InlineData("Classic", "Classic")]
    [InlineData("Static", "Drift")]
    [InlineData("Tank", "Tank")]
    public void EveryDiveReturnsLessThanTheBetAboutSevenTimesInTenAndClassicIsNotSaferThanTheOthers(string id, string name)
    {
        var config = ConfigLoader.LoadDefault();
        var dive = Catalog.Load(config).First(info => info.Id == id);
        var survival = Survival.For(config, dive);

        Assert.Equal($"About 7 in 10 {name} dives return less than the bet.", Odds.Line(dive.Name, dive.Figures.Rtp, 600, survival));
    }

    [Fact]
    public void WhenAlmostEveryDiveEndsUnderTheBetTheLineSaysNearlyEvery()
    {
        var award = new double[40];
        award[2] = 0.97;
        award[20] = 0.03;

        Assert.Equal("Nearly every Classic dive returns less than the bet.", Odds.Line("Classic Dive", 0.96, 100, new Survival(award)));
    }

    [Fact]
    public void ARoundAtOrOverTheBetSaysHowOftenADiveDoesAtLeastThatWell()
    {
        Assert.Equal("A win of 1× or more comes in about 1 Classic dive in 2.", Odds.Line("Classic Dive", 0.96, 1_000, Spread()));
        Assert.Equal("A win of 1.5× or more comes in about 1 Classic dive in 5.", Odds.Line("Classic Dive", 0.96, 1_500, Spread()));
        Assert.Equal("A win of 1.95× or more comes in about 1 Drift dive in 20.", Odds.Line("Drift Dive", 0.96, 1_950, Spread()));
    }

    [Fact]
    public void ABigWinNamesItsOwnMultipleAndIsRoundedToTwoDigits()
    {
        var award = new double[1_000];
        award[0] = 0.5;
        award[900] = 0.4992; // 45,000 units
        award[999] = 0.0008; // 49,950 units, 1 in 1,250
        var survival = new Survival(award);

        Assert.Equal("A win of 49.95× or more comes in about 1 Tank dive in 1,300.", Odds.Line("Tank Dive", 0.96, 49_950, survival));
    }

    [Fact]
    public void ARoundThatIsMoreLikelyThanNotNeverPrintsAFractionBelowOne()
    {
        var award = new double[40];
        award[0] = 0.1;
        award[20] = 0.9;
        var survival = new Survival(award);

        Assert.Equal("A win of 1× or more comes in more than half of Classic dives.", Odds.Line("Classic Dive", 0.96, 1_000, survival));
        Assert.Equal("About 1 in 10 Classic dives surfaces with nothing, and that is part of the 96%.", Odds.Line("Classic Dive", 0.96, 0, survival));

        var mostly = new double[40];
        mostly[0] = 0.6;
        mostly[20] = 0.4;
        Assert.Equal("More than half of all Classic dives surface with nothing, and that is part of the 96%.", Odds.Line("Classic Dive", 0.96, 0, new Survival(mostly)));
    }

    [Fact]
    public void AnUnderTheBetLineBelowOneInTenSaysSo()
    {
        var award = new double[40];
        award[2] = 0.04;
        award[20] = 0.96;

        Assert.Equal("Fewer than 1 in 10 Classic dives return less than the bet.", Odds.Line("Classic Dive", 0.96, 100, new Survival(award)));
    }

    [Fact]
    public void AnAwardThatCannotHappenHasNoLine()
    {
        Assert.Null(Odds.Line("Classic Dive", 0.96, 3_000, Spread()));
        Assert.Null(Odds.Line("Classic Dive", 0.96, 0, new Survival(new double[] { 0, 1 })));
    }

    [Theory]
    [InlineData("Classic")]
    [InlineData("Static")]
    [InlineData("Tank")]
    public void TheLineOfEachDiveUsesItsOwnDistributionAndNeverCountsAJackpotAsACrate(string id)
    {
        var config = ConfigLoader.LoadDefault();
        var dive = Catalog.Load(config).First(info => info.Id == id);
        var survival = Survival.For(config, dive);

        foreach (var units in new[] { 0, 250, 950, 1_000, 2_500, 10_000, 21_650 })
        {
            var line = Odds.Line(dive.Name, dive.Figures.Rtp, units, survival);
            if (line is null) continue;
            Assert.DoesNotContain("crate", line);
        }
        Assert.StartsWith("A win of 21.65× or more comes in about 1 ", Odds.Line(dive.Name, dive.Figures.Rtp, 21_650, survival)!);
    }
}
