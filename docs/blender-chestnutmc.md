# 从 Blender 栗籽人模到彩贝方映

栗籽人模是 Blender 插件 ChestnutMC Rig Addon 里的方块人骨架，集合名 `ChestnutMC_Rig_V3`，文件是 `ChestnutMC_Rig.blend`。彩贝方映不会把这个插件装进网页，只按它的骨骼名字来对应。

## 网页实际能读什么

| 来源 | 能读到 | 读不到 |
| --- | --- | --- |
| `.blend` | 文件头、骨骼名字和父子、物体名字、旧版 `bAction.curves` | 约束、IK、修改器、材质、网格蒙皮后的样子、Blender 4 分层动作 |
| glTF / GLB | 节点名字、已经结算好的位移和旋转 | 没导出的驱动、没选中的动作 |
| `caibei-structure` JSON | 你列出来的骨和曲线 | 网格 |

绑定用的 `ChestnutMC_Rig.blend` 里通常没有动画曲线。导入后可以看到骨架预览和自动对应，但「写入时间轴」会提示没有曲线。这是预期结果，不是文件坏了。

压缩过的 `.blend`（gzip）请在 Blender 里另存为未压缩，或改导出 glTF。

## 推荐做法

1. 在 Blender 4.2 或更新版本里启用栗籽人模，用控制骨摆姿势（`control.head`、`control.upper_arm.L` 这一层，不要直接动 `deformed.*`）。
2. 把动作烘焙成骨骼关键帧。FK 即可，网页不算 IK。
3. 导出 glTF / GLB，勾选骨骼动画，尽量打成单个 `.glb`。
4. 在彩贝方映点「导入结构」，核对对应关系，写入当前角色的时间轴。
5. 角色会改成「静态 / 关键帧」，这样预设不会和导入的姿势抢同一条通道。

若只想先看对应表，点「栗籽示例」。那是一份很小的 `public/examples/chestnut-wave.json`，右臂会挥起来。

## 默认对应

角色面向 +Z。栗籽人模名字里的 `.L` 是角色自己的左侧。

| 栗籽人模 | 方块人 |
| --- | --- |
| `control.root` | 位置（相对第一帧） |
| `control.hip` | 朝向 |
| `control.body_upper` | 身体 |
| `control.head` | 头 |
| `control.upper_arm.L` / `.R` | 左臂 / 右臂 |
| `control.upper_leg.L` / `.R` | 左腿 / 右腿 |

`control.lower_arm`、手指、脸和 `deformed.*` 默认不写入。方块人只有头、身体、双臂、双腿，没有第二截胳膊。预览里可以手动改对应，但两根骨写进同一个关节时，后写的曲线会盖住先写的。

`.blend` 里的位置是 Z 轴朝上：`(x, y, z)` 会变成工作室里的 `(x, z, -y)`。关节的欧拉角按 X/Y/Z 原样抄到对应关节。如果姿势拧了，多半是静止姿态和方块人的垂手姿势不一致，请改用 glTF（导入时会减去第一帧）。

## 插件里和这里有关的名字

这些只作对照，网页不会执行插件代码。

- `check_cmc_rig` / `get_cmc_rig`：父级是骨架，并且有名字以 `preview` 开头的网格，才算栗籽人模。彩贝方映用同样的线索，再加上 `control.head` 和 `control.upper_arm.L`。
- 动作预设 JSON 里的骨，和上表是同一套 `control.*`。
- 皮肤仍用工作室的「导入皮肤」，经典宽臂 64×64 PNG。插件里的皮肤图不要打进网页包。

## 想自己导出一份结构 JSON

在 Blender 的文本编辑器里运行下面的脚本，会在旁边写出 `caibei-structure` JSON。它采样的是当前动作里、控制骨的本地欧拉角，不替代 glTF，只方便没有导出器时试一条曲线。

```python
import bpy, json
arm = bpy.context.object
if arm.type != 'ARMATURE':
    raise RuntimeError('请选中栗籽人模的骨架')
action = arm.animation_data.action if arm.animation_data else None
bones = [{'name': b.name, 'parent': b.parent.name if b.parent else None} for b in arm.data.bones]
curves = []
if action and hasattr(action, 'fcurves'):
    for fcu in action.fcurves:
        if not fcu.data_path.startswith('pose.bones'):
            continue
        bone = fcu.data_path.split('"')[1]
        if not bone.startswith('control.'):
            continue
        curves.append({
            'bone': bone,
            'property': 'rotation_euler' if 'rotation_euler' in fcu.data_path else 'location',
            'index': fcu.array_index,
            'keys': [{'frame': k.co[0], 'value': k.co[1], 'interpolation': 'linear'} for k in fcu.keyframe_points],
        })
data = {
    'format': 'caibei-structure', 'version': 1, 'fps': bpy.context.scene.render.fps,
    'space': 'blender-z-up', 'rig': 'chestnutmc', 'bones': bones,
    'objects': [{'name': arm.name, 'typeName': 'armature'}],
    'actions': [{'name': action.name if action else 'pose', 'curves': curves}],
}
print(json.dumps(data, ensure_ascii=False, indent=2))
```

把打印结果存成 `.json`，用「导入结构」打开。`space` 要保持 `blender-z-up`，位置才会按上面的轴来换。
