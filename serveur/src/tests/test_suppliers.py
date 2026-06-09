"""Unit tests for supplier connectors (Mouser, DigiKey, Farnell) and OAuth — no network."""

from src.services.suppliers.base import OfferDTO, price_at_quantity
from src.services.suppliers.mouser import MouserConnector, _parse_price
from src.services.suppliers.digikey import DigiKeyConnector
from src.services.suppliers.farnell import FarnellConnector
from src.services.suppliers.oauth import OAuth2ClientCredentials


def test_parse_price_eu_and_us_formats():
    assert _parse_price("0,15 €") == 0.15
    assert _parse_price("1.234,56 €") == 1234.56
    assert _parse_price("$2.50") == 2.50
    assert _parse_price(None) is None
    assert _parse_price("N/A") is None


def test_price_at_quantity_picks_correct_break():
    breaks = [{"qty": 1, "price": 1.0}, {"qty": 10, "price": 0.5}, {"qty": 100, "price": 0.2}]
    assert price_at_quantity(breaks, 1) == 1.0
    assert price_at_quantity(breaks, 9) == 1.0
    assert price_at_quantity(breaks, 10) == 0.5
    assert price_at_quantity(breaks, 250) == 0.2
    assert price_at_quantity([], 5) is None


def test_mouser_is_configured_requires_key():
    # Explicit empty string => unconfigured, regardless of any key in .env.
    assert MouserConnector(api_key="").is_configured is False
    assert MouserConnector(api_key="abc").is_configured is True


def test_mouser_parses_offers_from_injected_payload():
    payload = {
        "Errors": [],
        "SearchResults": {
            "NumberOfResult": 1,
            "Parts": [
                {
                    "ManufacturerPartNumber": "GRM188R71H104KA93D",
                    "Manufacturer": "Murata",
                    "MouserPartNumber": "81-GRM188R71H104KA93",
                    "ProductDetailUrl": "https://mouser.com/p/1",
                    "DataSheetUrl": "https://mouser.com/ds/1.pdf",
                    "AvailabilityInStock": "1200",
                    "LeadTime": "28 Days",
                    "PriceBreaks": [
                        {"Quantity": 1, "Price": "0,15 €", "Currency": "EUR"},
                        {"Quantity": 100, "Price": "0,08 €", "Currency": "EUR"},
                    ],
                }
            ],
        },
    }
    connector = MouserConnector(api_key="key", http_post=lambda url, body: payload)
    offers = connector.search_by_mpn("GRM188R71H104KA93D")
    assert len(offers) == 1
    offer = offers[0]
    assert offer.supplier == "MOUSER"
    assert offer.mpn == "GRM188R71H104KA93D"
    assert offer.manufacturer == "Murata"
    assert offer.currency == "EUR"
    assert offer.unit_price == 0.15
    assert offer.stock_qty == 1200
    assert offer.lead_time_days == 28
    assert offer.price_for(100) == 0.08


def test_mouser_filters_to_exact_mpn():
    payload = {
        "SearchResults": {
            "Parts": [
                {"ManufacturerPartNumber": "OTHER", "PriceBreaks": []},
                {"ManufacturerPartNumber": "WANTED", "PriceBreaks": []},
            ]
        }
    }
    connector = MouserConnector(api_key="key", http_post=lambda url, body: payload)
    offers = connector.search_by_mpn("wanted")
    assert [o.mpn for o in offers] == ["WANTED"]


def test_digikey_inactive_without_credentials():
    # Explicit empty creds => inactive, regardless of any value in .env.
    connector = DigiKeyConnector(client_id="", client_secret="")
    assert connector.is_configured is False
    assert connector.search_by_mpn("X") == []


def test_digikey_parses_offers_with_token_and_payload():
    token_response = {"access_token": "tok", "expires_in": 600}
    products_payload = {
        "Products": [
            {
                "ManufacturerProductNumber": "GRM188R71H104KA93D",
                "Manufacturer": {"Name": "Murata"},
                "ProductUrl": "https://digikey.com/p/1",
                "DatasheetUrl": "https://digikey.com/ds/1.pdf",
                "QuantityAvailable": 5000,
                "ProductVariations": [
                    {
                        "DigiKeyProductNumber": "490-1234-1-ND",
                        "StandardPricing": [
                            {"BreakQuantity": 1, "UnitPrice": 0.12},
                            {"BreakQuantity": 100, "UnitPrice": 0.06},
                        ],
                    }
                ],
            }
        ]
    }
    oauth = OAuth2ClientCredentials(
        token_url="https://t", client_id="id", client_secret="sec",
        http_post=lambda url, form: token_response,
    )
    connector = DigiKeyConnector(
        client_id="id",
        client_secret="sec",
        oauth=oauth,
        http_post=lambda url, body, headers: products_payload,
    )
    assert connector.is_configured is True
    offers = connector.search_by_mpn("GRM188R71H104KA93D")
    assert len(offers) == 1
    offer = offers[0]
    assert offer.supplier == "DIGIKEY"
    assert offer.supplier_part == "490-1234-1-ND"
    assert offer.unit_price == 0.12
    assert offer.stock_qty == 5000
    assert offer.price_for(100) == 0.06


def test_farnell_is_configured_requires_key():
    # Explicit empty string => unconfigured, regardless of any key in .env.
    assert FarnellConnector(api_key="").is_configured is False
    assert FarnellConnector(api_key="abc").is_configured is True
    assert FarnellConnector(api_key="").search_by_mpn("X") == []


def test_farnell_parses_offers_from_injected_payload():
    payload = {
        "manufacturerPartNumberSearchReturn": {
            "numberOfResults": 1,
            "products": [
                {
                    "sku": "2509605",
                    "displayName": "Multilayer Ceramic Capacitor",
                    "translatedManufacturerPartNumber": "GRM188R71H104KA93D",
                    "brandName": "MURATA",
                    "vendorName": "MURATA",
                    "datasheets": [{"url": "https://farnell.com/ds/1.pdf", "description": "DS"}],
                    "stock": {"level": 1200, "leastLeadTime": 28, "status": "STOCK"},
                    "prices": [
                        {"from": 1, "to": 9, "cost": 0.15},
                        {"from": 100, "to": 499, "cost": 0.08},
                    ],
                }
            ],
        }
    }
    connector = FarnellConnector(api_key="key", http_get=lambda url, params: payload)
    offers = connector.search_by_mpn("GRM188R71H104KA93D")
    assert len(offers) == 1
    offer = offers[0]
    assert offer.supplier == "FARNELL"
    assert offer.mpn == "GRM188R71H104KA93D"
    assert offer.supplier_part == "2509605"
    assert offer.manufacturer == "MURATA"
    assert offer.currency == "EUR"
    assert offer.datasheet_url == "https://farnell.com/ds/1.pdf"
    assert offer.unit_price == 0.15
    assert offer.stock_qty == 1200
    assert offer.lead_time_days == 28
    assert offer.price_for(100) == 0.08


def test_farnell_filters_to_exact_mpn():
    payload = {
        "keywordSearchReturn": {
            "numberOfResults": 2,
            "products": [
                {"translatedManufacturerPartNumber": "OTHER", "prices": []},
                {"translatedManufacturerPartNumber": "WANTED", "prices": []},
            ],
        }
    }
    connector = FarnellConnector(api_key="key", http_get=lambda url, params: payload)
    offers = connector.search_by_mpn("wanted")
    assert [o.mpn for o in offers] == ["WANTED"]


def test_oauth_caches_token_until_expiry():
    calls = {"n": 0}

    def fake_post(url, form):
        calls["n"] += 1
        return {"access_token": f"tok{calls['n']}", "expires_in": 600}

    fake_clock = {"t": 1000.0}
    oauth = OAuth2ClientCredentials(
        token_url="https://t", client_id="id", client_secret="sec",
        http_post=fake_post, clock=lambda: fake_clock["t"],
    )
    assert oauth.get_token() == "tok1"
    assert oauth.get_token() == "tok1"  # cached
    assert calls["n"] == 1
    fake_clock["t"] += 10_000  # past expiry
    assert oauth.get_token() == "tok2"
    assert calls["n"] == 2
