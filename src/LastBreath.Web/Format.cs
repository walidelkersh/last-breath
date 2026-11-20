using System.Globalization;

namespace LastBreath.Web;

public static class Format
{
    private static readonly CultureInfo Culture = CultureInfo.InvariantCulture;

    public static string Credits(decimal credits) => credits.ToString("N2", Culture);

    public static string Percent(double share, int digits = 2) => (share * 100).ToString("F" + digits, Culture) + "%";

    public static string Number(double value, int digits = 2) => value.ToString("F" + digits, Culture);

    public static string Whole(long value) => value.ToString("N0", Culture);
}
