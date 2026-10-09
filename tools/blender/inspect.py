"""TerraVox Blender Worker - inspect.py (B2)."""
import argparse
import json
import math
import os
import sys

import bpy
import mathutils

SCHEMA_VERSION = 1

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="inspect.py")
    parser.add_argument("--output", required=True)
    parser.add_argument("--correlation-id", required=True)
    return parser.parse_args(argv)

def rounded(values):
    return [round(float(v), 6) for v in values]

def mesh_triangle_count(mesh):
    return sum(max(len(p.vertices) - 2, 0) for p in mesh.polygons)

def world_bounds(objects):
    mins = [math.inf] * 3
    maxs = [-math.inf] * 3
    found = False
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], world[i])
                maxs[i] = max(maxs[i], world[i])
            found = True
    if not found:
        return None
    return [maxs[i] - mins[i] for i in range(3)]

def build_report(correlation_id):
    scene = bpy.context.scene
    objects = list(scene.objects)
    mesh_objects = [o for o in objects if o.type == "MESH"]
    meshes = {o.data.name: o.data for o in mesh_objects}
    object_entries = []
    for obj in sorted(objects, key=lambda o: o.name):
        is_mesh = obj.type == "MESH"
        object_entries.append({
            "name": obj.name,
            "type": obj.type,
            "dimensions": rounded(obj.dimensions) if is_mesh else None,
            "location": rounded(obj.location),
        })
    overall = world_bounds(objects)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "correlationId": correlation_id,
        "blenderVersion": bpy.app.version_string,
        "sceneName": scene.name,
        "objectCount": len(objects),
        "meshCount": len(mesh_objects),
        "materialCount": len(bpy.data.materials),
        "triangleCount": sum(mesh_triangle_count(m) for m in meshes.values()),
        "objectNames": [e["name"] for e in object_entries],
        "materialNames": sorted(m.name for m in bpy.data.materials),
        "objects": object_entries,
        "dimensions": rounded(overall) if overall is not None else None,
    }

def main():
    args = parse_args()
    report = build_report(args.correlation_id)
    tmp_path = args.output + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, allow_nan=False)
    os.replace(tmp_path, args.output)

main()
