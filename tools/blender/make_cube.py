"""Developer-only helper that regenerates assets/blender/cube.blend."""
import sys
from pathlib import Path
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) != 1:
    raise SystemExit("usage: make_cube.py -- <output.blend>")

output = Path(argv[0]).expanduser().resolve()
output.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0.0, 0.0, 0.0))
cube = bpy.context.active_object
cube.name = "Cube"
cube.data.name = "Cube"
material = bpy.data.materials.new("CubeMaterial")
cube.data.materials.append(material)
bpy.context.scene.name = "CubeScene"
bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
