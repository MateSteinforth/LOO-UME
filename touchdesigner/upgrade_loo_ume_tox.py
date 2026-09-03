import hashlib
import json
import os

component = op("/project1/loo_ume_ddp")
if component is None:
    raise RuntimeError("Load loo_ume_ddp.tox at /project1 before this upgrade.")

source = component.op("source")
normalizer = component.op("input")
if source is None:
    if normalizer is None:
        raise RuntimeError("The component does not contain its input TOP.")
    normalizer.name = "source"
    source = component.op("source")
else:
    normalizer.destroy()

output = component.op("output")
if output is None:
    raise RuntimeError("The component does not contain its output TOP.")
source.outputConnectors[0].disconnect()
output.inputConnectors[0].disconnect()

normalizer = component.create(fitTOP, "input")
normalizer.nodeX = -150
normalizer.nodeY = 100
normalizer.par.fit = "fitoutside"
normalizer.par.outputresolution = "custom"
normalizer.par.resolutionw = 1280
normalizer.par.resolutionh = 640
normalizer.par.outputaspect = "resolution"
normalizer.par.resmult = False
source.nodeX = -400
source.nodeY = 100
source.par.label = "Image TOP"
output.nodeX = 150
output.nodeY = 100
output.par.label = "Centered 2:1 image"
source.outputConnectors[0].connect(normalizer)
normalizer.outputConnectors[0].connect(output)
component.par.opviewer = "./output"
component.comment = "LOO/UME TOP to logical DDP"

output_path = tdu.expandPath(component.par.externaltox.eval().strip())
if not output_path:
    raise RuntimeError("The loaded component does not have an external .tox path.")
receipt_path = output_path + ".json"
component.save(output_path)
with open(output_path, "rb") as source_file:
    tox_bytes = source_file.read()
with open(receipt_path, "w", encoding="utf-8") as target_file:
    json.dump({
        "schemaVersion": "1.0.0",
        "artifact": os.path.basename(output_path),
        "touchDesignerVersion": app.version,
        "touchDesignerBuild": app.build,
        "operatingSystem": app.osName,
        "byteLength": len(tox_bytes),
        "sha256": hashlib.sha256(tox_bytes).hexdigest(),
    }, target_file, indent=2)
    target_file.write("\n")
print("Updated " + output_path)
print("Updated " + receipt_path)
