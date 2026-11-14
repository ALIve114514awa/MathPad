using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class EngineManifest
{
    public long size { get; set; }
    public string sha256 { get; set; }
    public string[] chunks { get; set; }
}

internal static class Launcher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            var root = AppDomain.CurrentDomain.BaseDirectory;
            var runtime = Path.Combine(root, "runtime");
            var manifest = new JavaScriptSerializer().Deserialize<EngineManifest>(File.ReadAllText(Path.Combine(runtime, "engine.json")));
            var engine = Path.Combine(runtime, "MathPadHost.exe");
            var ready = Path.Combine(runtime, ".engine-ready");
            string mutexName;
            using (var sha = SHA256.Create()) mutexName = "Local\\MathPad.Launcher." + Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant())));
            using (var mutex = new Mutex(false, mutexName))
            {
                bool acquired;
                try { acquired = mutex.WaitOne(TimeSpan.FromSeconds(45)); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) throw new IOException("另一个启动窗口正在准备程序，请稍后重试。");
                try
                {
                    string signature = manifest.sha256;
                    bool valid = File.Exists(engine) && new FileInfo(engine).Length == manifest.size;
                    if (valid) signature += ":" + File.GetLastWriteTimeUtc(engine).Ticks.ToString(CultureInfo.InvariantCulture);
                    if (!valid || !File.Exists(ready) || File.ReadAllText(ready) != signature)
                    {
                        string staging = engine + "." + Process.GetCurrentProcess().Id + ".tmp";
                        try
                        {
                            using (var output = File.Create(staging))
                            {
                                foreach (var chunk in manifest.chunks)
                                {
                                    if (Path.GetFileName(chunk) != chunk) throw new IOException("运行包清单无效。");
                                    using (var input = File.OpenRead(Path.Combine(runtime, chunk)))
                                    using (var inflater = new DeflateStream(input, CompressionMode.Decompress)) inflater.CopyTo(output);
                                }
                            }
                            using (var input = File.OpenRead(staging))
                            using (var sha = SHA256.Create())
                                if (input.Length != manifest.size || Hex(sha.ComputeHash(input)) != manifest.sha256)
                                    throw new IOException("运行包校验失败，请重新完整下载并解压。");
                            if (File.Exists(engine)) File.Delete(engine);
                            File.Move(staging, engine);
                            File.WriteAllText(ready, manifest.sha256 + ":" + File.GetLastWriteTimeUtc(engine).Ticks.ToString(CultureInfo.InvariantCulture));
                        }
                        finally { if (File.Exists(staging)) File.Delete(staging); }
                    }
                }
                finally { mutex.ReleaseMutex(); }
            }
            Process.Start(new ProcessStartInfo(engine) { WorkingDirectory = runtime, UseShellExecute = false });
        }
        catch (Exception error)
        {
            MessageBox.Show("无法启动 Math Pad。请将整个仓库下载并解压到可写目录，保留 runtime 文件夹。\n\n" + error.Message,
                "Math Pad", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string Hex(byte[] bytes)
    {
        return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
    }
}
