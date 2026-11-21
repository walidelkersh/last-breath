using System.Globalization;

namespace LastBreath.Web;

public static class Format
{
    private static readonly CultureInfo Culture = CultureInfo.InvariantCulture;

    public static string Credits(decimal credits) => credits.ToString("N2", Culture);

    public static string Percent(double share, int digits = 2) => (share * 100).ToString("F" + digits, Culture) + "%";

    public static string Number(double value, int digits = 2) => value.ToString("F" + digits, Culture);

    public static string Whole(long value) => value.ToString("N0", Culture);

    // A value in units as a multiple of the bet: 250 units is 0.25, 100,000 is 100.
    public static string Multiple(int units) => (units / 1000m).ToString("#,0.##", Culture);
}
