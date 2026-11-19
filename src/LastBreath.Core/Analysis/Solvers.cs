namespace LastBreath.Core.Analysis;

public static class Solvers
{
    // The dive is passed apart from the id so the tuner can solve a copy with another numerator.
    public static Solution Solve(string id, GameConfig config, DiveConfig dive) => id switch
    {
        "Classic" => ClassicSolver.Solve(config, dive),
        "Static" => DriftSolver.Solve(config, dive),
        "Tank" => TankSolver.Solve(config, dive),
        _ => throw new ArgumentException($"no solver for dive '{id}'", nameof(id)),
    };
}
