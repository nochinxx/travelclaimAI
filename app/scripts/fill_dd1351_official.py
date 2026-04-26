import json
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, BooleanObject, FloatObject, NameObject, NumberObject, TextStringObject

DEFAULT_FIELD_FONT_SIZE = 7


def obj(value):
    return value.get_object() if hasattr(value, "get_object") else value


def form_date(value):
    if not value:
        return ""
    parts = str(value).split("-")
    if len(parts) == 3:
        return f"{parts[0]}{parts[1]}{parts[2]}"
    return str(value)


def year(value):
    parts = str(value or "").split("-")
    return parts[0] if len(parts) == 3 else ""


def month_day(value):
    parts = str(value or "").split("-")
    if len(parts) == 3:
        return f"{parts[1]}{parts[2]}"
    return str(value or "")


def money(value):
    if value is None or value == "":
        return ""
    return f"${float(value):,.2f}"


def visual_length(value):
    text = str(value or "")
    narrow = set(" .,;:!|'ilI[]()/\\-")
    wide = set("MW@#%&")
    length = 0.0

    for char in text:
        if char in narrow:
            length += 0.55
        elif char in wide:
            length += 1.25
        else:
            length += 1.0

    return length


def fit_font_size(value, base_size, max_visual_chars, min_size=4.5):
    length = visual_length(value)
    if length <= max_visual_chars:
        return base_size
    return max(min_size, round(base_size * max_visual_chars / length, 1))


def parse_address(value):
    parts = [part.strip() for part in str(value or "").split(",")]
    street = parts[0] if len(parts) > 0 else ""
    city = parts[1] if len(parts) > 1 else ""
    state_zip = parts[2].split() if len(parts) > 2 else []
    state = state_zip[0] if len(state_zip) > 0 else ""
    zip_code = state_zip[1] if len(state_zip) > 1 else ""
    return {
        "street": street,
        "city": city,
        "state": state,
        "zip": zip_code,
    }


def set_value(
    values,
    name,
    value,
    alignments=None,
    alignment=None,
    font_sizes=None,
    font_size=DEFAULT_FIELD_FONT_SIZE,
):
    if name and value is not None and value != "":
        values[name] = str(value)
        if alignments is not None and alignment is not None:
            alignments[name] = alignment
        if font_sizes is not None:
            font_sizes[name] = font_size


def itinerary_field(line, key):
    if line == 1:
        names = {
            "date": "form1[0].page1[0].left[0].fifteen[0].fifteen_line1[0].fifteen_dep_date_line1[0]",
            "place": "form1[0].page1[0].left[0].fifteen[0].fifteen_line1[0].fifteen_place_line1[0]",
            "modeCode": "form1[0].page1[0].left[0].fifteen[0].fifteen_line1[0].fifteen_means_line1[0]",
        }
        return names.get(key)

    if 2 <= line <= 7:
        base = f"form1[0].page1[0].left[0].fifteen[0].fifteen_line{line}[0]"
        names = {
            "date": f"{base}.#subform[0].fifteen_arr_date_line{line}[0]",
            "place": f"{base}.fifteen_place_line{line}[0]",
            "reasonCode": f"{base}.#subform[1].#subform[2].fifteen_reason_line{line}[0]",
            "modeCode": f"{base}.#subform[1].#subform[2].fifteen_means_line{line}[0]",
            "lodgingCost": f"{base}.#subform[1].fifteen_lodging_line{line}[0]",
            "pocMiles": f"{base}.#subform[1].#subform[3].fifteen_POCmiles_line{line}[0]",
        }
        return names.get(key)

    if line == 8:
        base = "form1[0].page1[0].left[0].fifteen[0].fifteen_line8[0]"
        names = {
            "date": f"{base}.fifteen_arr_date_line8[0]",
            "place": f"{base}.fifteen_place_line8[0]",
            "reasonCode": f"{base}.fifteen_reason_line8[0]",
            "lodgingCost": f"{base}.fifteen_lodging_line8[0]",
            "pocMiles": f"{base}.fifteen_POCmiles_line8[0]",
        }
        return names.get(key)

    return None


def expense_field(line, col):
    if 1 <= line <= 4:
        return f"form1[0].page1[0].left[0].sixteen_eighteen1[0].eighteen{col}_line{line}[0]"
    if 5 <= line <= 9:
        return f"form1[0].page1[0].eighteen2[0].eighteen{col}_line{line}[0]"
    return None


def build_fields(input_data):
    traveler = input_data["traveler"]
    address = parse_address(traveler.get("mailingAddress"))
    gtcc = input_data.get("gtcc", {})
    itinerary = input_data.get("itinerary", [])
    expenses = input_data.get("expenses", [])

    values = {}
    alignments = {}
    font_sizes = {}
    checks = set()

    set_value(
        values,
        "form1[0].page1[0].split[0].split_dollar[0]",
        money(gtcc.get("splitDisbursementAmount")),
        alignments,
        2,
        font_sizes,
        7,
    )
    name = traveler.get("name")
    street = address["street"]
    city = address["city"]
    email = traveler.get("email")
    phone = traveler.get("phone")
    order_number = input_data.get("travelOrderNumber")
    organization_station = f"{traveler.get('organization', '')}, {traveler.get('station', '')}".strip(", ")

    set_value(values, "form1[0].page1[0].left[0].two[0]", name, alignments, 0, font_sizes, fit_font_size(name, 8, 31, 5.5))
    set_value(values, "form1[0].page1[0].left[0].three[0]", traveler.get("grade"), font_sizes=font_sizes, font_size=8)
    set_value(values, "form1[0].page1[0].left[0].four[0].four_specify[0]", traveler.get("dodIdOrSsnPlaceholder"), font_sizes=font_sizes, font_size=7)
    set_value(values, "form1[0].page1[0].left[0].sixA[0]", street, alignments, 0, font_sizes, fit_font_size(street, 8, 28, 5.5))
    set_value(values, "form1[0].page1[0].left[0].sixB[0]", city, font_sizes=font_sizes, font_size=fit_font_size(city, 8, 18, 5.5))
    set_value(values, "form1[0].page1[0].left[0].sixC[0]", address["state"], font_sizes=font_sizes, font_size=8)
    set_value(values, "form1[0].page1[0].left[0].sixD[0]", address["zip"], font_sizes=font_sizes, font_size=8)
    set_value(values, "form1[0].page1[0].left[0].sixE[0]", email, alignments, 0, font_sizes, fit_font_size(email, 6, 36, 4.5))
    set_value(values, "form1[0].page1[0].left[0].seven_eight_eleven_twelve[0].seven[0]", phone, font_sizes=font_sizes, font_size=fit_font_size(phone, 8, 16, 5))
    set_value(values, "form1[0].page1[0].left[0].seven_eight_eleven_twelve[0].eight[0]", order_number, font_sizes=font_sizes, font_size=fit_font_size(order_number, 7, 25, 4.8))
    set_value(
        values,
        "form1[0].page1[0].left[0].seven_eight_eleven_twelve[0].eleven[0]",
        organization_station,
        alignments,
        0,
        font_sizes,
        fit_font_size(organization_station, 7.4, 66, 5.2),
    )
    set_value(values, "form1[0].page1[0].left[0].nine_thirteen_fourteen[0].nine[0]", input_data.get("previousAdvances") or "None", font_sizes=font_sizes, font_size=8)
    set_value(values, "form1[0].page1[0].twentyB[0]", input_data.get("claimantSignatureDate"), font_sizes=font_sizes, font_size=7)
    set_value(values, "form1[0].page1[0].twenty1A[0]", input_data.get("approvingOfficial"), font_sizes=font_sizes, font_size=7)

    first_itinerary_date = itinerary[0].get("date") if itinerary else input_data.get("travelStartDate")
    set_value(
        values,
        "form1[0].page1[0].left[0].fifteen[0].fifteenAB_header[0].fifteenA_year[0]",
        year(first_itinerary_date),
        font_sizes=font_sizes,
        font_size=8,
    )

    for index, row in enumerate(itinerary[:8], start=1):
        place = row.get("place")
        set_value(values, itinerary_field(index, "date"), month_day(row.get("date")), font_sizes=font_sizes, font_size=7)
        set_value(values, itinerary_field(index, "place"), place, alignments, 0, font_sizes, fit_font_size(place, 7, 58, 4.8))
        set_value(values, itinerary_field(index, "modeCode"), row.get("modeCode"), font_sizes=font_sizes, font_size=7)
        set_value(values, itinerary_field(index, "reasonCode"), row.get("reasonCode"), font_sizes=font_sizes, font_size=7)
        set_value(values, itinerary_field(index, "lodgingCost"), money(row.get("lodgingCost")), alignments, 2, font_sizes, 7)
        set_value(values, itinerary_field(index, "pocMiles"), row.get("pocMiles"), alignments, 2, font_sizes, 7)

    for index, expense in enumerate(expenses[:9], start=1):
        allowed_amount = expense.get("allowedAmount", expense.get("amount"))
        category = expense.get("category")
        set_value(values, expense_field(index, "A"), form_date(expense.get("date")), font_sizes=font_sizes, font_size=6)
        set_value(values, expense_field(index, "B"), category, alignments, 0, font_sizes, fit_font_size(category, 7.2, 38, 5))
        set_value(values, expense_field(index, "C"), money(expense.get("amount")), alignments, 2, font_sizes, 7)
        set_value(values, expense_field(index, "D"), money(allowed_amount), alignments, 2, font_sizes, 7)

    if input_data.get("eftSelected"):
        checks.add("form1[0].page1[0].one[0].one_EFT[0]")
    if gtcc.get("used"):
        checks.add("form1[0].page1[0].split[0].payTheFollowing[0]")
    if input_data.get("travelPurpose") == "TDY":
        checks.add("form1[0].page1[0].right[0].five[0].five_left[0].five_TDY[0]")
    if input_data.get("claimantType") == "Member/Employee":
        checks.add("form1[0].page1[0].right[0].five[0].five_right[0].five_memberEmployees[0]")
    if any(row.get("modeCode") == "PA" for row in itinerary):
        checks.add("form1[0].page1[0].left[0].sixteen_eighteen1[0].sixteen_own_operate[0]")
    checks.add("form1[0].page1[0].left[0].seventeen[0].seventeen_moreThan24[0]")

    return values, checks, alignments, font_sizes


def on_name(widget):
    ap = obj(widget.get("/AP"))
    normal = obj(ap.get("/N")) if ap else None
    if normal:
        for key in normal.keys():
            if str(key) != "/Off":
                return key
    return NameObject("/Yes")


def fill_walk(field_ref, values, checks, alignments, font_sizes, parent=""):
    field = obj(field_ref)
    partial = field.get("/T")
    name = f"{parent}.{partial}" if parent and partial else str(partial) if partial else parent

    if name in values:
        value = TextStringObject(values[name])
        field.update({
            NameObject("/V"): value,
            NameObject("/DV"): value,
        })
        apply_text_appearance(
            field,
            font_sizes.get(name),
            alignments.get(name),
        )

    if name in checks:
        kids = field.get("/Kids", [])
        widgets = [obj(kid) for kid in kids] if kids else [field]
        selected = None
        for widget in widgets:
            if "/AP" in widget:
                selected = selected or on_name(widget)
                widget.update({NameObject("/AS"): selected})
        field.update({NameObject("/V"): selected or NameObject("/Yes")})

    for kid_ref in field.get("/Kids", []):
        kid = obj(kid_ref)
        if "/T" in kid:
            fill_walk(kid_ref, values, checks, alignments, font_sizes, name)
        elif name in checks:
            kid.update({NameObject("/AS"): on_name(kid)})


def apply_text_appearance(field, font_size=None, alignment=None):
    if font_size is not None:
        field.update({NameObject("/DA"): TextStringObject(f"/TiRo {font_size:g} Tf 0 g")})
    if alignment is not None:
        field.update({NameObject("/Q"): NumberObject(alignment)})

    for kid_ref in field.get("/Kids", []):
        kid = obj(kid_ref)
        if font_size is not None:
            kid.update({NameObject("/DA"): TextStringObject(f"/TiRo {font_size:g} Tf 0 g")})
            if NameObject("/AP") in kid:
                del kid[NameObject("/AP")]
        if alignment is not None:
            kid.update({NameObject("/Q"): NumberObject(alignment)})


def hide_signature_walk(field_ref):
    field = obj(field_ref)

    if field.get("/FT") == NameObject("/Sig"):
        hide_annotation(field)
        for kid_ref in field.get("/Kids", []):
            hide_annotation(obj(kid_ref))
        return

    for kid_ref in field.get("/Kids", []):
        hide_signature_walk(kid_ref)


def hide_annotation(annotation):
    annotation.update({
        NameObject("/F"): NumberObject(35),
        NameObject("/Rect"): ArrayObject([
            FloatObject(0),
            FloatObject(0),
            FloatObject(0),
            FloatObject(0),
        ]),
    })

    for key in [NameObject("/AP"), NameObject("/V"), NameObject("/DV")]:
        if key in annotation:
            del annotation[key]


def flatten_pdf(path):
    try:
        import fitz
    except ImportError:
        return False

    source = Path(path)
    temp = source.with_suffix(".flattened.pdf")
    doc = fitz.open(source)
    doc.bake()
    doc.save(temp)
    doc.close()
    temp.replace(source)
    return True


def fill_pdf(template_path, input_path, output_path):
    input_data = json.loads(Path(input_path).read_text(encoding="utf-8-sig"))
    values, checks, alignments, font_sizes = build_fields(input_data)

    reader = PdfReader(str(template_path))
    if reader.is_encrypted:
        reader.decrypt("")

    writer = PdfWriter()
    writer.append(reader)

    acro = obj(writer._root_object["/AcroForm"])
    acro.update({NameObject("/NeedAppearances"): BooleanObject(True)})

    if NameObject("/XFA") in acro:
        del acro[NameObject("/XFA")]

    for field_ref in acro["/Fields"]:
        hide_signature_walk(field_ref)

    for field_ref in acro["/Fields"]:
        fill_walk(field_ref, values, checks, alignments, font_sizes)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as file:
        writer.write(file)

    flatten_pdf(output_path)


def main():
    if len(sys.argv) != 4:
        print("Usage: fill_dd1351_official.py <template.pdf> <input.json> <output.pdf>", file=sys.stderr)
        raise SystemExit(2)

    fill_pdf(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
    print(f"Wrote {sys.argv[3]}")


if __name__ == "__main__":
    main()
