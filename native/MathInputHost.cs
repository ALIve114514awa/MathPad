using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[ComImport, Guid("EBA615AA-FAC6-4738-BA5F-FF09E9FE473E")]
[InterfaceType(ComInterfaceType.InterfaceIsDual)]
internal interface IMathInputControl
{
    void Show();
    void Hide();
    void IsVisible([MarshalAs(UnmanagedType.VariantBool)] out bool visible);
    void GetPosition(out int left, out int top, out int right, out int bottom);
    void SetPosition(int left, int top, int right, int bottom);
    void Clear();
    void SetCustomPaint(int element, [MarshalAs(UnmanagedType.VariantBool)] bool paint);
    void SetCaptionText([MarshalAs(UnmanagedType.BStr)] string caption);
    void LoadInk([MarshalAs(UnmanagedType.Interface)] object ink);
    void SetOwnerWindow(IntPtr owner);
}

internal static class MathInputHost
{
    private static readonly Guid ControlClass = new Guid("C561816C-14D8-4090-830C-98D994B21C7B");
    private static readonly Guid ControlEvents = new Guid("683336B5-A47D-4358-96F9-875A472AE70A");
    private const int InsertEvent = 0;
    private const int CloseEvent = 1;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out NativeRect bounds);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        internal int Left, Top, Right, Bottom;
    }

    [STAThread]
    private static void Main(string[] args)
    {
        using (var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)))
        {
            output.AutoFlush = true;
            long handle;
            if (args.Length != 1 || !long.TryParse(args[0], NumberStyles.HexNumber, CultureInfo.InvariantCulture, out handle))
            {
                Write(output, "unavailable");
                return;
            }
            var owner = new IntPtr(handle);
            if (!IsWindow(owner))
            {
                Write(output, "cancelled");
                return;
            }

            try
            {
                SetProcessDpiAwarenessContext(new IntPtr(-4)); // Per-monitor DPI awareness v2.
                Run(owner, output);
            }
            catch (Exception error)
            {
                Write(output, "unavailable", errorCode: "0x" + error.HResult.ToString("X8", CultureInfo.InvariantCulture));
            }
        }
    }

    private static void Run(IntPtr owner, TextWriter output)
    {
        object instance = Activator.CreateInstance(Type.GetTypeFromCLSID(ControlClass, true));
        IMathInputControl control = null;
        bool insertSubscribed = false;
        bool closeSubscribed = false;
        string result = null;
        string mathml = null;
        int parentClosed = 0;

        using (var lifetime = new ApplicationContext())
        using (var watch = new System.Windows.Forms.Timer { Interval = 100 })
        {
            Action<string> insert = value =>
            {
                if (result != null) return;
                mathml = value;
                result = "inserted";
                lifetime.ExitThread();
            };
            Action close = () =>
            {
                if (result != null) return;
                result = "cancelled";
                lifetime.ExitThread();
            };
            var parent = new Thread(() =>
            {
                try { Console.OpenStandardInput().ReadByte(); }
                catch (IOException) { }
                finally { Interlocked.Exchange(ref parentClosed, 1); }
            }) { IsBackground = true };

            try
            {
                control = (IMathInputControl)instance;
                control.SetOwnerWindow(owner);
                control.SetCaptionText("Math Pad · Windows 数学输入");
                Position(control, owner);
                ComEventsHelper.Combine(instance, ControlEvents, InsertEvent, insert);
                insertSubscribed = true;
                ComEventsHelper.Combine(instance, ControlEvents, CloseEvent, close);
                closeSubscribed = true;
                parent.Start();
                watch.Tick += (sender, args) =>
                {
                    if (Volatile.Read(ref parentClosed) != 0 || !IsWindow(owner)) close();
                    else
                    {
                        try
                        {
                            bool visible;
                            control.IsVisible(out visible);
                            if (!visible) close();
                        }
                        catch (COMException) { close(); }
                    }
                };
                control.Show();
                Write(output, "shown");
                if (result == null)
                {
                    watch.Start();
                    Application.Run(lifetime);
                }
            }
            finally
            {
                watch.Stop();
                try
                {
                    if (control != null) control.Hide();
                    if (closeSubscribed) ComEventsHelper.Remove(instance, ControlEvents, CloseEvent, close);
                    if (insertSubscribed) ComEventsHelper.Remove(instance, ControlEvents, InsertEvent, insert);
                }
                catch (COMException) { } // The control may already have closed its COM window.
                finally { Marshal.FinalReleaseComObject(instance); }
            }
        }

        Write(output, result ?? "cancelled", mathml);
    }

    private static void Position(IMathInputControl control, IntPtr owner)
    {
        Rectangle area = Screen.FromHandle(owner).WorkingArea;
        NativeRect bounds;
        if (!GetWindowRect(owner, out bounds)) return;
        double scale = Math.Max(96, GetDpiForWindow(owner)) / 96.0;
        int width = Math.Min((int)(500 * scale), area.Width);
        int height = Math.Min((int)(290 * scale), area.Height);
        int left = Math.Max(area.Left, Math.Min((bounds.Left + bounds.Right - width) / 2, area.Right - width));
        int top = Math.Max(area.Top, Math.Min((bounds.Top + bounds.Bottom - height) / 2, area.Bottom - height));
        control.SetPosition(left, top, left + width, top + height);
    }

    private static void Write(TextWriter output, string status, string mathml = null, string errorCode = null)
    {
        output.WriteLine(Json.Serialize(new { status, mathml, errorCode }));
    }
}
