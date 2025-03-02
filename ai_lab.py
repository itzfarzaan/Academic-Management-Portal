from nltk import pos_tag
from nltk.tokenize import word_tokenize
import nltk 


text = """Natural Language Processing is a field of Artificial Intelligence."""

def pos_tagging(tokens):
  tagged=pos_tag(tokens)
  return tagged

def main_function():
  # Tokenization
  print("Original Text:\n",text,"\n")
  tokens=word_tokenize(text)
  print("Tokenized Words: \n")
  for token in tokens:
    print(token)

  pos_tags = pos_tagging(tokens)
  print("\nPOS TAGS:\n")
  for word, tag in pos_tags:
    print(f"{word}: {tag}")


main_function()