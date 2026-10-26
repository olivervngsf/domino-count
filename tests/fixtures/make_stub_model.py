"""Builds a stand-in ONNX model with the real reader's input/output shapes, for browser tests.
It ignores the photo and always "finds" two tiles: 6|9 (sideways) and 12|3 (upright)."""
import numpy as np, onnx, sys
from onnx import helper, TensorProto, numpy_helper
dets = [(285, 300, 30, 30, 6, .95), (315, 300, 30, 30, 9, .93), (400, 285, 30, 30, 12, .97), (400, 315, 30, 30, 3, .92)]
n = len(dets); out = np.zeros((1, 23, n), np.float32)
for j, (cx, cy, w, h, v, s) in enumerate(dets):
    out[0, :4, j] = (cx, cy, w, h); out[0, 4 + v, j] = s
g = helper.make_graph(
    [helper.make_node('ReduceMean', ['images'], ['m'], keepdims=0),
     helper.make_node('Mul', ['m', 'zero'], ['z']),
     helper.make_node('Add', ['z', 'dets'], ['output0'])],
    'stub', [helper.make_tensor_value_info('images', TensorProto.FLOAT, [1, 3, 640, 640])],
    [helper.make_tensor_value_info('output0', TensorProto.FLOAT, [1, 23, n])],
    [numpy_helper.from_array(np.array(0, np.float32), 'zero'), numpy_helper.from_array(out, 'dets')])
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)]); m.ir_version = 8
onnx.checker.check_model(m); onnx.save(m, sys.argv[1])
