namespace LastBreath.Tests;

// Rolls for a scripted source. A spin draws once per empty cell in cell order, so a test lists the
// cells in that order: Miss for cells that stay empty, Crate for a cell that lands a crate.
internal static class Rolls
{
    public static int[] Miss(int cells) => Enumerable.Repeat(999_999, cells).ToArray();

    // The outcome roll 0 is a crate in every dive. The tier roll picks the value from the dive's weight table.
    public static int[] Crate(int tierRoll = 0) => [0, tierRoll];

    public static int[] Crates(int count, int tierRoll = 0) =>
        Enumerable.Repeat(Crate(tierRoll), count).SelectMany(roll => roll).ToArray();
}
