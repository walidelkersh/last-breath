using LastBreath.Core;

namespace LastBreath.Web;

// How long a spin stays on the board before the next one lands. A spin with nothing in it passes quickly, one with crates
// stays a little, a jackpot stays long enough for its moment on the board, and the last breath holds a beat longer before the spin that can end the round.
public static class Pacing
{
    public const int StartMs = 600;
    public const int NothingMs = 450;
    public const int CratesMs = 800;
    public const int JackpotMs = 1600;
    public const int LastBreathMs = 1500;

    public static int Pause(Spin spin)
    {
        var jackpot = spin.NewCells.Any(index => spin.Cells[index].Kind == CellKind.Jackpot);
        var landed = spin.NewCells.Length > 0 || spin.AirTanks.Length > 0;
        var pause = jackpot ? JackpotMs : landed ? CratesMs : NothingMs;
        return spin.ClockAfter == 1 ? Math.Max(pause, LastBreathMs) : pause;
    }
}
