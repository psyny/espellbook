def replace_placeholders(template, replacements):
    html = template
    for key, value in replacements.items():
        placeholder = f"{{{{ {key} }}}}"
        html = html.replace(f"/* {placeholder} */", value)
        html = html.replace(f'"{placeholder}"', value)
        html = html.replace(placeholder, value)
    return html
