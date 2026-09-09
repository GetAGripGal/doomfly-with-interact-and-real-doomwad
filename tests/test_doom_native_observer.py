"""Prescribed actions validate observer isolation; they are not a live policy."""
import json,random,time
import numpy as np
import pytest
from doom.game import Game
from doom.observer import NativeObserver,ObserverBusy,ObserverUnavailable,camera_query,ENGINE

@pytest.mark.parametrize('query',['x=0&y=0&z=40&yaw=20&pitch=nan','x=0&x=1&y=0&z=40&yaw=0&pitch=0','x=0&y=0&z=40&yaw=360&pitch=0','x=0&y=0&z=40&yaw=0&pitch=0&command=kill','x=0&y=0&z=40&yaw=0&pitch=90'])
def test_camera_rejects_unsafe_or_ambiguous_values(query):
    with pytest.raises(ValueError):camera_query(query)

def test_camera_numbers():
    assert camera_query('x=-2&y=1.5&z=40&yaw=0&pitch=-30')==[-2,1.5,40,0,-30]

@pytest.mark.skipif(not ENGINE.is_file(),reason='Build the optional native observer first')
def test_native_render_is_read_only_and_mirror_tracks_every_action():
    for seed in [41027,713,20260909]:
        primary=Game(seed=seed,scenario='combat_survival',spectator=True)
        observer=NativeObserver(primary,seed,'combat_survival')
        rng=random.Random(seed)
        try:
            for tick in range(500):
                if primary.observation()['finished']:
                    primary.new_episode();observer.advance(primary,reset=True)
                assert not observer.error
                if tick%7==0:
                    before=primary.pixels();state=primary.observation();observer.last_render=0
                    view=json.loads(observer.render([rng.uniform(-300,300),rng.uniform(-300,300),rng.uniform(30,100),rng.uniform(0,359),rng.uniform(-35,35)]))
                    assert view['game']==state
                    assert view['verified_ticks']>0
                    np.testing.assert_array_equal(before,primary.pixels())
                    assert primary.observation()==state
                action={'turn':rng.uniform(-6,6),'forward':18 if tick%150<100 else 0,'attack':tick%25<20}
                primary.act(action);observer.advance(primary,action)
                assert not observer.error
            observer.mirror.act({'turn':0,'forward':0,'attack':False})
            primary.act({'turn':1,'forward':10,'attack':True})
            observer.advance(primary,{'turn':1,'forward':10,'attack':True})
            assert observer.error
            with pytest.raises(ObserverUnavailable):observer.render([0,0,60,0,0])
        finally:observer.close();primary.close()
