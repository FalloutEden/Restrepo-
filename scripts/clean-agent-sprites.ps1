Add-Type -AssemblyName System.Drawing
$drawingAssemblyPath = [System.Drawing.Bitmap].Assembly.Location
Add-Type -ReferencedAssemblies @($drawingAssemblyPath) -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class SpriteTransparencyCleaner
{
    private static bool IsBackground(byte r, byte g, byte b, byte a)
    {
        int max = Math.Max(r, Math.Max(g, b));
        int min = Math.Min(r, Math.Min(g, b));
        int spread = max - min;
        int brightness = (r + g + b) / 3;
        return a >= 250 && brightness >= 150 && spread <= 28;
    }

    private static void Enqueue(Queue<int> queue, int x, int y, int width, int height)
    {
        if (x < 0 || x >= width || y < 0 || y >= height)
        {
            return;
        }

        queue.Enqueue((y * width) + x);
    }

    public static void Clean(string path)
    {
        Bitmap bitmap;
        using (var source = (Bitmap)Image.FromFile(path))
        {
            bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
                graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;
                graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
                graphics.DrawImage(source, 0, 0, source.Width, source.Height);
            }
        }

        using (bitmap)
        {
            var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var data = bitmap.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);

            try
            {
                int stride = data.Stride;
                int width = bitmap.Width;
                int height = bitmap.Height;
                int byteCount = Math.Abs(stride) * height;
                byte[] pixels = new byte[byteCount];
                Marshal.Copy(data.Scan0, pixels, 0, byteCount);

                bool[] visited = new bool[width * height];
                bool[] background = new bool[width * height];
                Queue<int> queue = new Queue<int>(width * 4 + height * 4);

                for (int x = 0; x < width; x++)
                {
                    Enqueue(queue, x, 0, width, height);
                    Enqueue(queue, x, height - 1, width, height);
                }

                for (int y = 1; y < height - 1; y++)
                {
                    Enqueue(queue, 0, y, width, height);
                    Enqueue(queue, width - 1, y, width, height);
                }

                while (queue.Count > 0)
                {
                    int point = queue.Dequeue();
                    if (visited[point])
                    {
                        continue;
                    }

                    visited[point] = true;
                    int x = point % width;
                    int y = point / width;
                    int offset = (y * stride) + (x * 4);

                    byte b = pixels[offset];
                    byte g = pixels[offset + 1];
                    byte r = pixels[offset + 2];
                    byte a = pixels[offset + 3];

                    if (!IsBackground(r, g, b, a))
                    {
                        continue;
                    }

                    background[point] = true;
                    Enqueue(queue, x + 1, y, width, height);
                    Enqueue(queue, x - 1, y, width, height);
                    Enqueue(queue, x, y + 1, width, height);
                    Enqueue(queue, x, y - 1, width, height);
                }

                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        int point = (y * width) + x;
                        if (!background[point])
                        {
                            continue;
                        }

                        int offset = (y * stride) + (x * 4);
                        pixels[offset] = 0;
                        pixels[offset + 1] = 0;
                        pixels[offset + 2] = 0;
                        pixels[offset + 3] = 0;
                    }
                }

                Marshal.Copy(pixels, 0, data.Scan0, byteCount);
            }
            finally
            {
                bitmap.UnlockBits(data);
            }

            string tempPath = path + ".tmp.png";
            bitmap.Save(tempPath, ImageFormat.Png);
            File.Copy(tempPath, path, true);
            File.Delete(tempPath);
        }
    }
}
"@

$spritePaths = @(
  "public/agents/Ada Wong.png",
  "public/agents/Albert Wesker.png",
  "public/agents/HUNK.png",
  "public/agents/Nemesis.png",
  "public/agents/Red Queen.png",
  "public/agents/Tyrant.png",
  "public/agents/Umbrella-Core.png",
  "public/agents/William Birkin.png"
)

foreach ($relativePath in $spritePaths) {
  $fullPath = (Resolve-Path $relativePath).Path
  [SpriteTransparencyCleaner]::Clean($fullPath)
  Write-Output ("Cleaned {0}" -f $relativePath)
}
