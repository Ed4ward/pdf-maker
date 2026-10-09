---
name: pdf-editor
description: 在 ZCode 侧栏编辑工作区 PDF:用图片替换页面、添加文字、新建/删除/移动页面,用户在面板确认后导出新 PDF。
---

# PDF 编辑器

用户想编辑工作区里的 PDF(替换某页为图片、添加文字、增删/排序页面)时使用本插件。

1. 先调用 `load_pdf(path)` 打开工作区中的 PDF(`path` 相对于工作区根目录);返回文档 ID、页数与页面尺寸。同时侧栏会打开编辑面板,展示当前状态。
2. 编辑通过工具完成,每次调用都会返回**完整文档状态**;不要凭记忆描述文档,以返回值为准:
   - `replace_page_with_image(doc_id, page_index, image_path)`:把第 `page_index`(0 起)页替换为工作区里的图片(PNG/JPG/WebP);
   - `add_text(doc_id, page_index, text, x?, y?, size?, color?)`:添加文字框,坐标为 0~1 归一化(0.5 居中),size 是相对页宽的字号(默认 0.06);
   - `add_blank_page` / `delete_page` / `move_page`:插入空白页、删除页、移动页序;
   - `set_replacement_layout` / `clear_page_replacement` / `update_text` / `remove_text`:微调已有编辑。
3. **导出**:`export_pdf(doc_id, path, overwrite?)` 按当前顺序重建文档并写入工作区;目标文件已存在时需要 `overwrite: true`,不要静默覆盖。含文字的页面由面板在导出前合成高分辨率位图;若返回 `composite_required`,提示用户在面板中点击一次「导出」以完成合成,或让面板自动完成。
4. 所有修改只在内存与插件数据目录中,**导出前原文件不会被改动**。面板中的删除按钮带确认,但 Agent 直接调用 `delete_page` 不经过确认:仅在被明确要求时删除页面。
5. 面板支持可视化预览、替换前后滑动对比与拖动微调;用户在面板里的操作与 Agent 的工具操作共享同一份文档状态。回答用户时描述当前状态请引用最新工具返回,不要使用过期信息。
