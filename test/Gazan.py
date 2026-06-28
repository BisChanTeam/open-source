from kivy.app import App
from kivy.uix.carousel import Carousel
from kivy.uix.image import AsyncImage
class CarouselApp(App):
    def build(self):
        carousel = Carousel(direction="right")
        images = [
            "https://encrypted-tbn0.gstatic.com/images?
q=tbn:ANd9GcRnTQ04WdzI8_nx_D7_gGQK5nyjsunQOHNm5g&s",
            "https://encrypted-tbn0.gstatic.com/images?
q=tbn:ANd9GcQSEXgbWNiFQuIwkxm_0bEm5fT3jSeLQygSfg&s",
            "https://encrypted-tbn0.gstatic.com/images?
q=tbn:ANd9GcRxrndZgFXMaTcu_atM5SltSo20Ks28WXcSag&s",
           
"https://yt3.googleusercontent.com/g3eRfaT0MwPAOq0qQNzKTSdh3MLnZ7oXhh2lDo
Hac-aw-NStnfkIZGO9i75ShCstUKuNKAP9Cxk=s176-c-k-c0x00ffffff-no-rj-mo"
        ]
        for img in images:
            image = AsyncImage(source=img, allow_stretch=True)
            carousel.add_widget(image)
        return carousel
if __name__ == '__main__':
    CarouselApp().run()