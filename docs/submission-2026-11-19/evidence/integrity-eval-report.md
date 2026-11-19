# 离线完整性评测

结果：全部符合预期

符号级覆盖与空壳判定已纳入；业务语义保留、真实模型与仓颉编译仍未验证。负面用例通过表示错误被正确记录，不表示转换成功。

| 用例 | 符合预期 | 转换状态 | 导出状态 | 空壳判定 |
|---|---|---|---|---|
| normal | true | complete | complete | passed |
| empty | true | partial | failed | failed |
| comments | true | partial | failed | failed |
| partial | true | partial | partial | failed |
| self-check-exhausted | true | partial | failed | failed |
| unsupported | true | partial | failed | failed |
| todo | true | partial | failed | failed |
| header-only | true | partial | partial | failed |
| drop-file | true | partial | partial | failed |
| low-retention | true | complete | complete | failed |

详细断言失败见 report.json。测试数据和中间导出仅保留在 .deepworks/tmp，不自动删除。
