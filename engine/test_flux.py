"""Test FLUX.1-schnell image generation on 8GB VRAM."""
import time
import torch
from diffusers import FluxPipeline

model_id = "black-forest-labs/FLUX.1-schnell"
output_path = r"E:\share\project\mypro\课程总结\model\test_flux_output.png"
prompt = "A beautiful infographic poster about the quadratic equation, featuring the formula x = (-b ± sqrt(b²-4ac)) / 2a with colorful annotations, geometric parabola graph, dark blue gradient background with gold accents, modern clean design, educational illustration"

print(f"[T+0s] Loading FLUX.1-schnell...", flush=True)
t0 = time.time()

pipe = FluxPipeline.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,
)
# CPU offload to fit 8GB VRAM
pipe.enable_model_cpu_offload()

print(f"[T+{time.time()-t0:.1f}s] Model loaded, generating image...", flush=True)

image = pipe(
    prompt=prompt,
    num_inference_steps=4,
    guidance_scale=0.0,
    width=1024,
    height=1024,
).images[0]

image.save(output_path)
print(f"[T+{time.time()-t0:.1f}s] Image saved to {output_path}", flush=True)

# Print GPU memory stats
print(f"Peak VRAM: {torch.cuda.max_memory_allocated()/1024**3:.2f} GiB", flush=True)
