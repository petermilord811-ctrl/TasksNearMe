# Face models for our own ID check

Used by `src/integrations/ocr/face-engine.ts` (in its own process, with OpenCV 5's WebAssembly build,
`@techstark/opencv-js`). Read from this folder at run time; never downloaded. Added 2026-11-27 (owner: verify the
license deeply on our own server with open-source technology, no paid services).

| File | What it does | Source | License | SHA-256 |
|---|---|---|---|---|
| `yunet.onnx` (229,738 B) | Finds faces and 5 landmarks (YuNet, 2026may, any input size) | opencv/opencv_zoo `models/face_detection_yunet/face_detection_yunet_2026may.onnx` (commit 48b10fa) | MIT | `ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0` |
| `sface-int8.onnx` (9,896,933 B) | 128 numbers per aligned 112×112 face (SFace, 2021dec, int8) | huggingface.co/opencv/face_recognition_sface `face_recognition_sface_2021dec_int8.onnx` (commit 3d70824) | Apache-2.0 | `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a` |
| `minifasnet-v2.onnx` (1,743,581 B) | Live face or a photo/screen (MiniFASNet V2, 80×80, face box ×2.7) | yakhyo/face-anti-spoofing release `weights/MiniFASNetV2.onnx`, from minivision-ai/Silent-Face-Anti-Spoofing | Apache-2.0 | `b32929adc2d9c34b9486f8c4c7bc97c1b69bc0ea9befefc380e4faae4e463907` |
| `minifasnet-v1se.onnx` (1,742,335 B) | The same (MiniFASNet V1SE, face box ×4.0) | yakhyo/face-anti-spoofing release `weights/MiniFASNetV1SE.onnx` | Apache-2.0 | `ebab7f90c7833fbccd46d3a555410e78d969db5438e169b6524be444862b3676` |

The int8 SFace gave the same answers as the fp32 model on a sanity check (two portraits of one person years apart:
0.796 vs 0.802; two people: 0.17–0.24 vs 0.16–0.24).

**Caveat for counsel (blueprint 06 F10/F21):** the weights are MIT and Apache-2.0, but YuNet was trained on WIDER FACE
and SFace on CASIA-WebFace, VGGFace2 and MS-Celeb, datasets released for research. Nearly every open face model shares
this. The only recognition model found trained on commercially licensed data is `fal/AuraFace-v1` `glintr100.onnx`
(Apache-2.0, 260 MB); it can replace `sface-int8.onnx` if counsel asks.

MiniFASNet is a hint for our team, never a decision: small passive anti-spoofing models generalize poorly across
cameras.
