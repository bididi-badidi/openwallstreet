import unittest
from credibility.pipeline import page_chunks

class ChunkTests(unittest.TestCase):
    def test_every_character_and_original_page_survives_chunking(self):
        pages=['A'*170000,'MD&A management promise: target 2030.','B'*200000]
        chunks=list(page_chunks(pages))
        for index,original in enumerate(pages,1):
            self.assertEqual(''.join(item['text'] for chunk in chunks for item in chunk if item['page']==index),original)
        self.assertTrue(all(sum(len(item['text']) for item in chunk)<=160000 for chunk in chunks))
        self.assertTrue(any('target 2030' in item['text'] for chunk in chunks for item in chunk))

if __name__=='__main__': unittest.main()
