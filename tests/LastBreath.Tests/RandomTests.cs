using LastBreath.Core;

namespace LastBreath.Tests;

[Trait("Category", "Common")]
public sealed class RandomTests
{
    [Fact]
    public void MatchesPcg32ReferenceOutputForSeed42Sequence54()
    {
        var random = new Pcg32Random(42, 54);
        uint[] expected = [0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e];
        Assert.Equal(expected, expected.Select(_ => random.NextUInt32()).ToArray());
    }

    [Fact]
    public void SameSeedRepeatsAndDifferentSeedsDiverge()
    {
        int[] Draw(ulong seed)
        {
            var random = new Pcg32Random(seed);
            return Enumerable.Range(0, 20).Select(_ => random.NextInt(60)).ToArray();
        }

        Assert.Equal(Draw(7), Draw(7));
        Assert.NotEqual(Draw(7), Draw(8));
    }

    [Theory]
    [InlineData(60)]
    [InlineData(832)]
    [InlineData(1000)]
    public void BoundedDrawStaysInRangeAndReachesBothEnds(int bound)
    {
        var random = new Pcg32Random(2026);
        var draws = Enumerable.Range(0, 50_000).Select(_ => random.NextInt(bound)).ToArray();
        Assert.Equal(0, draws.Min());
        Assert.Equal(bound - 1, draws.Max());
    }

    [Fact]
    public void BoundedDrawIsRoughlyUniform()
    {
        var random = new Pcg32Random(99);
        var counts = new int[60];
        for (var i = 0; i < 600_000; i++) counts[random.NextInt(60)]++;
        Assert.All(counts, count => Assert.InRange(count, 9_500, 10_500));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void NonPositiveBoundIsRejected(int bound)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new Pcg32Random(1).NextInt(bound));
    }
}
