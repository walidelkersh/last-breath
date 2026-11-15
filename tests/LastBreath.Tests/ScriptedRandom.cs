using LastBreath.Core;

namespace LastBreath.Tests;

// Replays fixed rolls and records the bound of every request, so a test can pin the draw order.
internal sealed class ScriptedRandom(params int[] rolls) : IRandomSource
{
    private readonly Queue<int> _rolls = new(rolls);

    public List<int> Bounds { get; } = [];

    public int Remaining => _rolls.Count;

    public uint NextUInt32() => throw new NotSupportedException();

    public int NextInt(int exclusiveMaximum)
    {
        Bounds.Add(exclusiveMaximum);
        var roll = _rolls.Dequeue();
        Assert.InRange(roll, 0, exclusiveMaximum - 1);
        return roll;
    }
}
