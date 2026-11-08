"""本地英译中与中文简繁转换；任何失败都不会伪造译文。"""
from __future__ import annotations

import re

HAN = re.compile(r"[\u3400-\u9fff]")
LATIN = re.compile(r"[A-Za-z]")


def has_chinese(value: str) -> bool:
    return bool(HAN.search(value or ""))


class LocalTranslator:
    """在构建时加载 Argos 离线模型，不向第三方接口提交阅读数据。"""

    def __init__(self, allow_download: bool = True) -> None:
        self.allow_download = allow_download
        self._translation = None
        self._translation_attempted = False
        self._converter = None
        try:
            from opencc import OpenCC
            self._converter = OpenCC("t2s")
        except ImportError:
            pass

    def simplify(self, value: str) -> str:
        if self._converter is None:
            return value
        try:
            return self._converter.convert(value)
        except Exception:
            return value

    def _get_translation(self):
        if self._translation_attempted:
            return self._translation
        self._translation_attempted = True
        try:
            import argostranslate.package as package
            import argostranslate.translate as translate
            installed = translate.get_installed_languages()
            en = next((lang for lang in installed if lang.code == "en"), None)
            zh = next((lang for lang in installed if lang.code == "zh"), None)
            if (en is None or zh is None) and self.allow_download:
                package.update_package_index()
                pkg = next((p for p in package.get_available_packages()
                            if p.from_code == "en" and p.to_code == "zh"), None)
                if pkg is None:
                    raise RuntimeError("未找到 en → zh 翻译模型")
                package.install_from_path(pkg.download())
                installed = translate.get_installed_languages()
                en = next((lang for lang in installed if lang.code == "en"), None)
                zh = next((lang for lang in installed if lang.code == "zh"), None)
            if en is not None and zh is not None:
                self._translation = en.get_translation(zh)
            else:
                print("TRANSLATION WARNING: 英译中模型未安装")
        except Exception as exc:
            print("TRANSLATION WARNING:", type(exc).__name__, str(exc)[:180])
        return self._translation

    def to_chinese(self, value: str) -> str:
        """成功则返回中文；失败返回空字符串，调用者必须显示真实原文。"""
        value = (value or "").strip()
        if not value:
            return ""
        if has_chinese(value):
            return self.simplify(value)
        translation = self._get_translation()
        if translation is None:
            return ""
        try:
            result = self.simplify(translation.translate(value).strip())
            # Argos 模型偶尔原样返回英文；这种情况不能标记为已翻译。
            return result if has_chinese(result) else ""
        except Exception as exc:
            print("TRANSLATION WARNING: 内容转换失败:", type(exc).__name__)
            return ""
