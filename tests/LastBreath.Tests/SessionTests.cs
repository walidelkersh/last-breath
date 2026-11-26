using LastBreath.Web;

namespace LastBreath.Tests;

[Trait("Category", "Client")]
public sealed class SessionTests
{
    [Fact]
    public void TheTotalsAreTheSumsOfTheRoundsAndTheReturnIsTheirRatio()
    {
        var session = new Session();
        session.Add("Classic Dive", 1.00m, 21.65m);
        session.Add("Classic Dive", 1.00m, 0m);

        Assert.Equal((2, 2.00m, 21.65m), (session.Rounds, session.Bet, session.Returned));
        Assert.Equal(21.65 / 2.00, session.Return!.Value, 10);
    }

    [Fact]
    public void RoundsAtDifferentBetsAreWeightedByTheirBets()
    {
        var session = new Session();
        session.Add("Classic Dive", 4.00m, 10.00m);
        session.Add("Tank Dive", 0.20m, 0m);

        Assert.Equal((4.20m, 10.00m), (session.Bet, session.Returned));
        Assert.Equal(10.00 / 4.20, session.Return!.Value, 10);
    }

    [Fact]
    public void ThereIsNoReturnBeforeTheFirstRound()
    {
        Assert.Null(new Session().Return);
    }

    [Fact]
    public void OnlyTheLastTwelveRoundsAreKeptAndTheOldestLeavesFirst()
    {
        var session = new Session();
        for (var round = 1; round <= 14; round++) session.Add("Classic Dive", 1.00m, round);

        Assert.Equal(14, session.Rounds);
        Assert.Equal(Enumerable.Range(3, 12), session.Recent.Select(result => result.Number));
        Assert.Equal(Enumerable.Range(3, 12).Select(round => (decimal)round), session.Recent.Select(result => result.Win));
    }

    [Fact]
    public void ClearingForgetsEverything()
    {
        var session = new Session();
        session.Add("Classic Dive", 1.00m, 5.00m);

        session.Clear();

        Assert.Equal((0, 0m, 0m), (session.Rounds, session.Bet, session.Returned));
        Assert.Empty(session.Recent);
        Assert.Null(session.Return);
    }

    [Theory]
    [InlineData(0.00, Tier.Nothing)]
    [InlineData(0.05, Tier.Under)]
    [InlineData(0.99, Tier.Under)]
    [InlineData(1.00, Tier.Over)]
    [InlineData(9.99, Tier.Over)]
    [InlineData(10.00, Tier.Big)]
    [InlineData(21.65, Tier.Big)]
    public void ATierIsSetByTheMultipleOfTheBet(double win, Tier tier)
    {
        Assert.Equal(tier, new RoundResult(1, "Classic Dive", 1.00m, (decimal)win).Tier);
    }

    [Fact]
    public void TheTierFollowsTheMultipleAndNotTheAmount()
    {
        Assert.Equal(Tier.Big, new RoundResult(1, "Classic Dive", 4.00m, 40.00m).Tier);
        Assert.Equal(Tier.Over, new RoundResult(1, "Classic Dive", 4.00m, 39.80m).Tier);
    }

    [Fact]
    public void TheBarsBendLikeALogarithmAndAHundredBetsFillThem()
    {
        Assert.Equal(0, Session.Height(0));
        Assert.Equal(1, Session.Height(100));
        Assert.Equal(1, Session.Height(5_000));
        Assert.Equal(Math.Log10(5) / Math.Log10(401), Session.Height(1), 10);
        Assert.Equal(0.2685, Session.Height(1), 4);
        Assert.True(Session.Height(0.25m) < Session.Height(1) && Session.Height(1) < Session.Height(10) && Session.Height(10) < Session.Height(100));
    }
}
