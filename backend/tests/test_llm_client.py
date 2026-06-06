import pytest
from unittest.mock import MagicMock
from luma.services.llm_client import _normalize_reasoning_response

def test_normalize_reasoning_response_dict():
    # Test dictionary input
    response = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "reasoning": "This is reasoning output"
                }
            }
        ]
    }
    _normalize_reasoning_response(response)
    assert response["choices"][0]["message"]["content"] == "This is reasoning output"


def test_normalize_reasoning_response_dict_reasoning_content():
    # Test dictionary input with reasoning_content
    response = {
        "choices": [
            {
                "message": {
                    "content": None,
                    "reasoning_content": "This is reasoning content"
                }
            }
        ]
    }
    _normalize_reasoning_response(response)
    assert response["choices"][0]["message"]["content"] == "This is reasoning content"


def test_normalize_reasoning_response_object():
    # Test object input
    class Message:
        def __init__(self, content, reasoning):
            self.content = content
            self.reasoning = reasoning

    class Choice:
        def __init__(self, message):
            self.message = message

    class ModelResponse:
        def __init__(self, choices):
            self.choices = choices

    msg = Message("", "Object reasoning output")
    choice = Choice(msg)
    response = ModelResponse([choice])

    _normalize_reasoning_response(response)
    assert response.choices[0].message.content == "Object reasoning output"


def test_normalize_reasoning_response_object_dict_hybrid():
    # Test where object contains content as both attribute and dict key
    class Message(dict):
        def __init__(self, content, reasoning):
            super().__init__()
            self["content"] = content
            self["reasoning"] = reasoning
            self.content = content
            self.reasoning = reasoning

    class Choice:
        def __init__(self, message):
            self.message = message

    class ModelResponse:
        def __init__(self, choices):
            self.choices = choices

    msg = Message("", "Hybrid reasoning output")
    choice = Choice(msg)
    response = ModelResponse([choice])

    _normalize_reasoning_response(response)
    assert response.choices[0].message.content == "Hybrid reasoning output"
    assert response.choices[0].message["content"] == "Hybrid reasoning output"


def test_normalize_reasoning_response_no_override_if_content_exists():
    response = {
        "choices": [
            {
                "message": {
                    "content": "Existing content",
                    "reasoning": "Reasoning content"
                }
            }
        ]
    }
    _normalize_reasoning_response(response)
    assert response["choices"][0]["message"]["content"] == "Existing content"
