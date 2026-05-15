"""Quick test: load GGUF SenseNova model and generate one image."""
import sys
import time

model_id = "sensenova/SenseNova-U1-8B-MoT"
gguf_path = r"E:\share\project\mypro\课程总结\model\SenseNova-U1-8B-MoT\SenseNova-U1-8B-MoT-Q6_K.gguf"
output_path = r"E:\share\project\mypro\课程总结\model\test_output.png"
prompt = "A colorful educational diagram showing the mathematical formula for the quadratic equation, with clear labels and visual elements"

print(f"[T+0s] Loading model {model_id} with GGUF", flush=True)
t0 = time.time()

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

print(f"[T+{time.time()-t0:.1f}s] Loading tokenizer...", flush=True)
tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

print(f"[T+{time.time()-t0:.1f}s] Loading model (GGUF, this may take a while)...", flush=True)

# Try GGUF loading via diffusers GGUFQuantizeConfig
try:
    from diffusers import GGUFQuantizeConfig
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        gguf_file=gguf_path,
        gguf_quantize_config=GGUFQuantizeConfig(vram_mode="balanced"),
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
except Exception as e:
    print(f"[T+{time.time()-t0:.1f}s] GGUFQuantizeConfig failed: {e}", flush=True)
    print(f"[T+{time.time()-t0:.1f}s] Trying gguf_checkpoint fallback...", flush=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        gguf_checkpoint=gguf_path,
        vram_mode="balanced",
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )

print(f"[T+{time.time()-t0:.1f}s] Model loaded, generating image...", flush=True)

messages = [{"role": "user", "content": prompt}]
inputs = tokenizer.apply_chat_template(
    messages, add_generation_prompt=True, return_tensors="pt", return_dict=True
).to(model.device)

with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=4096,
        do_sample=True,
        temperature=0.7,
        top_p=0.9,
    )

generated = outputs[0][inputs["input_ids"].shape[1]:]
result_text = tokenizer.decode(generated, skip_special_tokens=False)
print(f"[T+{time.time()-t0:.1f}s] Output preview: {result_text[:300]}", flush=True)

# Try to extract and save image
from PIL import Image
saved = False

if hasattr(model, 'decode_image') and '<|vision_start|>' in result_text:
    try:
        img = model.decode_image(generated)
        img.save(output_path)
        saved = True
        print(f"decode_image() worked", flush=True)
    except Exception as e:
        print(f"decode_image failed: {e}", flush=True)

if not saved and hasattr(model, 'generate_image'):
    try:
        img = model.generate_image(prompt=prompt, width=1024, height=1024)
        if isinstance(img, Image.Image):
            img.save(output_path)
            saved = True
            print(f"generate_image() worked", flush=True)
    except Exception as e:
        print(f"generate_image failed: {e}", flush=True)

if saved:
    print(f"[T+{time.time()-t0:.1f}s] SUCCESS - Image saved to {output_path}", flush=True)
else:
    print(f"[T+{time.time()-t0:.1f}s] Could not generate image. Checking model methods...", flush=True)
    print(f"Model methods: {[m for m in dir(model) if 'image' in m.lower() or 'vision' in m.lower() or 'decode' in m.lower()]}", flush=True)
    print(f"Output length: {len(result_text)}", flush=True)

print(f"Total time: {time.time()-t0:.1f}s", flush=True)
