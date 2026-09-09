"""Tests use prescribed engine actions, never a replacement live policy."""
import json
import numpy as np
from doom.game import Game
from doom.broadcast import Broadcast
from test_doom_broadcast import frame

def test_observer_export_does_not_change_game_or_input():
    a=Game(seed=41107,scenario='combat_survival')
    b=Game(seed=41107,scenario='combat_survival',spectator=True)
    try:
        for tick in range(400):
            assert a.observation()==b.observation()
            if a.observation()['finished']:a.new_episode();b.new_episode()
            image=a.pixels()
            geometry=b.spectator()
            assert geometry['tick']==b.tick
            assert geometry['episode']==b.episode
            assert geometry['timing']=='pre-action'
            assert len(geometry['sectors'][0]['lines'])==4
            np.testing.assert_array_equal(image,b.pixels())
            action={'turn':4 if tick%100<50 else -3,'forward':18,'attack':tick%5!=0}
            assert a.act(action)==b.act(action)
    finally:a.close();b.close()

def test_spectator_is_optional_and_reaches_immutable_batches():
    stream=Broadcast();a=frame();a['spectator']={'timing':'pre-action','tick':0}
    stream.publish(a);stream.publish(frame(2,1788650001))
    packet=json.loads(stream.get_segment(a['run_id'],'1788650000'))
    assert packet['frames'][0]['spectator']==a['spectator']
