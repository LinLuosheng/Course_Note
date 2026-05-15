"""Test SD 3.5 Medium image generation on 8GB VRAM."""
import time
import torch
from diffusers import StableDiffusion3Pipeline

model_id = "stabilityai/stable-diffusion-3.5-medium"
output_path = r"E:\share\project\mypro\课程总结\model\test_sd35_output.png"
prompt = "A beautiful infographic poster about the quadratic equation, featuring the formula x = (-b ± sqrt(b²-4ac)) / 2a with colorful annotations, geometric parabola graph, dark blue gradient background with gold accents, modern clean design, educational illustration"

print(f"[T+0s] Loading {model_id}...", flush=True)
t0 = time.time()

pipe = StableDiffusion3Pipeline.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,
)
pipe.enable_model_cpu_offload()

print(f"[T+{time.time()-t0:.1f}s] Model loaded, generating image...", flush=True)
torch.cuda.reset_peak_memory_stats()

image = pipe(
    prompt=prompt,
    num_inference_steps=28,
    guidance_scale=4.5,
    width=1024,
    height=1024,
).images[0]

image.save(output_path)
elapsed = time.time() - t0
print(f"[T+{elapsed:.1f}s] Image saved to {output_path}", flush=True)
print(f"Peak VRAM: {torch.cuda.max_memory_allocated()/1024**3:.2f} GiB", flush=True)
